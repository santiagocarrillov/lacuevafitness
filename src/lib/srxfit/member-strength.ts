// What the coach sees about a socio's strength on the ficha: today's station
// suggestion (the same one the socio reads in Portal › Hoy) and the trend of
// each main lift. Plain module: the ficha page does the auth.

import { prisma } from "@/lib/prisma";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { ecuadorParts } from "@/lib/portal/tz";
import { getTodayPrescription } from "@/lib/portal/prescription";
import { getSessionForDate } from "@/lib/srxfit-calendar";
import { fuerzaToMd } from "@/lib/srxfit-md";
import { mainExerciseFromMd } from "@/lib/self-log/main-set";
import { strengthTrends, type LiftTrend } from "@/lib/srxfit/strength-trend";
import type { Prescription } from "@/lib/srxfit/prescription";
import type { Member } from "@/generated/prisma/client";

/** Today's main lift as programmed (week-editor override first); null on rest days. */
export async function todayMainExercise(now = new Date()): Promise<string | null> {
  const { year, month, day } = ecuadorParts(now);
  const session = getSessionForDate(new Date(year, month - 1, day));
  if (!session) return null;
  const override = await prisma.srxfitSessionOverride.findFirst({
    where: { weekNumber: session.weekNumber, dayIndex: new Date(year, month - 1, day).getDay() },
    select: { fuerzaMd: true },
  });
  return mainExerciseFromMd(override?.fuerzaMd ?? fuerzaToMd(session.blocks.fuerza));
}

export type MemberStrength = {
  /** null on rest days and in the re-evaluation week (no stations). */
  prescription: Prescription | null;
  trends: LiftTrend[];
  /** Sets the socio logged that no coach has validated yet (not in the trend). */
  pending: number;
};

export async function getMemberStrength(member: Pick<Member, "id" | "sex" | "dateOfBirth" | "joinedAt">): Promise<MemberStrength> {
  const now = new Date();
  const { year, month, day } = ecuadorParts(now);
  const session = getSessionForDate(new Date(year, month - 1, day));

  const [sets, pending, attendance] = await Promise.all([
    prisma.mainSetLog.findMany({
      where: { memberId: member.id, ...OFFICIAL_ENTRY_WHERE },
      orderBy: { date: "desc" },
      take: 120,
      select: { exercise: true, loadKg: true, reps: true, rir: true, date: true },
    }),
    prisma.mainSetLog.count({ where: { memberId: member.id, source: "MEMBER", verifiedAt: null } }),
    prisma.attendance.findMany({
      where: { memberId: member.id, recordedAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
      select: { recordedAt: true },
    }),
  ]);

  const prescription =
    session && session.phase !== "Re-evaluación"
      ? await getTodayPrescription({ member, phase: session.phase, attendanceDates: attendance.map((a) => a.recordedAt), now })
      : null;

  return { prescription, trends: strengthTrends(sets), pending };
}
