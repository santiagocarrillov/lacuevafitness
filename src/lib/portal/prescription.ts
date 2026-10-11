// Loads what "Tu prescripción de hoy" needs for one socio and runs the rules.
// Plain module: the caller (the socio's own Hoy page) does the auth.

import { prisma } from "@/lib/prisma";
import { ecuadorParts } from "@/lib/portal/tz";
import { prescribe, type Prescription } from "@/lib/srxfit/prescription";
import type { Member } from "@/generated/prisma/client";

const DAY_MS = 86400000;
/** Ecuador calendar day as a day number, so differences are whole days. */
function dayNumber(d: Date): number {
  const { year, month, day } = ecuadorParts(d);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

const COMPOSITION_GOAL = /grasa|peso|composici|defin|adelgaz|tonific|m[uú]scul|masa/i;
const LEVEL = { LEVEL_1: 1, LEVEL_2: 2, LEVEL_3: 3 } as const;

export async function getTodayPrescription(opts: {
  member: Pick<Member, "id" | "sex" | "dateOfBirth" | "joinedAt">;
  phase: string;
  /** The socio's attendance timestamps (any order). */
  attendanceDates: Date[];
  now: Date;
}): Promise<Prescription> {
  const { member, phase, attendanceDates, now } = opts;
  const today = dayNumber(now);

  const [level, clinical, goals, sets, firstVisit] = await Promise.all([
    prisma.trainingLevelAssignment.findFirst({ where: { memberId: member.id }, orderBy: { assignedAt: "desc" }, select: { level: true } }),
    prisma.clinicalMarker.findFirst({
      where: { memberId: member.id, menopausalStatus: { not: null } },
      orderBy: { measuredAt: "desc" },
      select: { menopausalStatus: true },
    }),
    prisma.memberGoal.findMany({ where: { memberId: member.id, achieved: false }, select: { goal: true } }),
    prisma.mainSetLog.findMany({ where: { memberId: member.id }, orderBy: { date: "desc" }, take: 12 }),
    prisma.attendance.findFirst({ where: { memberId: member.id }, orderBy: { recordedAt: "asc" }, select: { recordedAt: true } }),
  ]);

  // Visits before today, one per day.
  const visitDays = [...new Set(attendanceDates.map(dayNumber))].filter((d) => d < today).sort((a, b) => b - a);
  const since = (days: number) => visitDays.filter((d) => d >= today - days).length;

  // joinedAt can be the import date: the first visit is the better start when earlier.
  const started = firstVisit && firstVisit.recordedAt < member.joinedAt ? firstVisit.recordedAt : member.joinedAt;
  const birth = member.dateOfBirth;
  const { year, month, day } = ecuadorParts(now);
  const age = birth
    ? year - birth.getUTCFullYear() - (month < birth.getUTCMonth() + 1 || (month === birth.getUTCMonth() + 1 && day < birth.getUTCDate()) ? 1 : 0)
    : null;

  return prescribe({
    phase,
    sex: member.sex,
    age,
    menopausal: clinical?.menopausalStatus ?? null,
    level: level ? LEVEL[level.level] : null,
    weeksTraining: Math.floor((today - dayNumber(started)) / 7),
    daysSinceLastVisit: visitDays.length ? today - visitDays[0] : null,
    visitsLast14: since(14),
    visitsLast21: since(21),
    compositionGoal: goals.some((g) => COMPOSITION_GOAL.test(g.goal)),
    mainSets: sets.map((s) => ({
      exercise: s.exercise,
      loadKg: s.loadKg,
      reps: s.reps,
      rir: s.rir,
      // Date-only column stored at UTC midnight.
      daysAgo: today - Math.floor(s.date.getTime() / DAY_MS),
    })),
  });
}
