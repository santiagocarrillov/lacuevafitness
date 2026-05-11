/**
 * One-off fix: sessions that were misregistered today's UTC date because the
 * server (UTC) thought it was tomorrow during 7pm-12am Ecuador. Moves them
 * back to yesterday's Ecuador date with the matching weekday schedule.
 *
 * Usage: npx tsx scripts/fix-attendance-timezone.ts
 *
 * Safe to re-run; it only touches sessions whose date == today (Ecuador).
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const ECUADOR_TZ = "America/Guayaquil";

function ecuadorParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TZ,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  return {
    year: Number(parts.find((p) => p.type === "year")!.value),
    month: Number(parts.find((p) => p.type === "month")!.value),
    day: Number(parts.find((p) => p.type === "day")!.value),
    weekday: parts.find((p) => p.type === "weekday")!.value.slice(0, 3).toUpperCase(),
  };
}

const DAY_BACK: Record<string, string> = {
  SUN: "SAT", MON: "SUN", TUE: "MON", WED: "TUE", THU: "WED", FRI: "THU", SAT: "FRI",
};

async function main() {
  const t = ecuadorParts();
  const todayUtc = new Date(Date.UTC(t.year, t.month - 1, t.day));
  const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayWeekday = DAY_BACK[t.weekday]!;

  console.log(`Ecuador today: ${t.year}-${String(t.month).padStart(2,"0")}-${String(t.day).padStart(2,"0")} (${t.weekday})`);
  console.log(`Looking for sessions with date = ${todayUtc.toISOString().slice(0,10)} (Ecuador today, should be empty at 6am)\n`);

  const wrongSessions = await prisma.classSession.findMany({
    where: { date: todayUtc },
    include: { schedule: true, attendance: true, coachConfirmation: true },
    orderBy: { startAt: "asc" },
  });

  console.log(`Found ${wrongSessions.length} sessions to inspect.\n`);

  let moved = 0;
  let merged = 0;
  let skipped = 0;
  let totalAttendanceMoved = 0;

  for (const s of wrongSessions) {
    if (!s.schedule) {
      console.log(`  ⚠ SKIP — session ${s.id}: no schedule attached.`);
      skipped++;
      continue;
    }
    const sched = s.schedule;
    const label = `${sched.sede} ${sched.name} (${sched.startTime}) · ${s.attendance.length} attendances`;

    // Find yesterday's matching schedule (same sede + startTime, weekday=yesterday)
    const targetSchedule = await prisma.classSchedule.findFirst({
      where: {
        sede: sched.sede,
        startTime: sched.startTime,
        dayOfWeek: yesterdayWeekday as any,
        active: true,
      },
    });

    if (!targetSchedule) {
      console.log(`  ⚠ SKIP — ${label}: no hay schedule equivalente ayer (${yesterdayWeekday}).`);
      skipped++;
      continue;
    }

    // Check if a session already exists for that target slot
    const existing = await prisma.classSession.findUnique({
      where: { scheduleId_date: { scheduleId: targetSchedule.id, date: yesterdayUtc } },
    });

    const [hh, mm] = sched.startTime.split(":").map(Number);
    const newStartAt = new Date(Date.UTC(
      yesterdayUtc.getUTCFullYear(), yesterdayUtc.getUTCMonth(), yesterdayUtc.getUTCDate(),
      hh + 5, mm, 0, 0,
    ));

    if (existing) {
      // Merge: transfer attendance records into the existing session, then delete current.
      let transferred = 0;
      for (const a of s.attendance) {
        await prisma.attendance.upsert({
          where: { memberId_classSessionId: { memberId: a.memberId, classSessionId: existing.id } },
          update: {},
          create: {
            memberId: a.memberId,
            classSessionId: existing.id,
            recordedByUserId: a.recordedByUserId,
            expiredMembershipAlert: a.expiredMembershipAlert,
            recordedAt: a.recordedAt,
          },
        });
        transferred++;
      }
      // Delete the original misfiled session (cascade removes its attendance + coachConfirmation)
      await prisma.classSession.delete({ where: { id: s.id } });
      // Recount admin count on the merged session
      const total = await prisma.attendance.count({ where: { classSessionId: existing.id } });
      await prisma.classSession.update({
        where: { id: existing.id },
        data: {
          adminCount: total,
          discrepancy: existing.coachCount != null ? total !== existing.coachCount : false,
        },
      });
      console.log(`  ↪ MERGE — ${label}: ${transferred} attendances merged into existing yesterday session.`);
      merged++;
      totalAttendanceMoved += transferred;
    } else {
      // Move: update scheduleId + date + startAt
      await prisma.classSession.update({
        where: { id: s.id },
        data: { scheduleId: targetSchedule.id, date: yesterdayUtc, startAt: newStartAt },
      });
      console.log(`  ✓ MOVE  — ${label}: → ayer (${yesterdayWeekday}).`);
      moved++;
      totalAttendanceMoved += s.attendance.length;
    }
  }

  console.log(`\nResultado:`);
  console.log(`  ${moved} sesiones movidas`);
  console.log(`  ${merged} sesiones mergeadas con una existente`);
  console.log(`  ${skipped} saltadas (sin schedule equivalente)`);
  console.log(`  ${totalAttendanceMoved} asistencias relocalizadas en total`);

  // Sanity: confirm today is now empty
  const remaining = await prisma.classSession.count({ where: { date: todayUtc } });
  console.log(`\nSesiones restantes con fecha de hoy: ${remaining} (debería ser 0 antes de las 5:30am ya pasadas)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
