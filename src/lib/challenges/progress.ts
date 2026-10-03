/**
 * Attendance-challenge progress — the unguarded core.
 *
 * Plain module (no "use server"): nothing here is a callable endpoint. It is
 * used by the challenge actions (recalculate) and by attendance registration,
 * both of which check their caller before getting here.
 */

import { prisma } from "@/lib/prisma";
import type { ChallengeRuleType } from "@/generated/prisma/client";
import { isMetricRule } from "@/lib/challenges/metrics";

export type AttendanceChallenge = {
  ruleType: ChallengeRuleType;
  ruleDays: number | null;
  startsAt: Date;
  endsAt: Date;
};

export async function computeAttendanceCount(
  challenge: AttendanceChallenge,
  memberId: string,
  now: Date,
): Promise<number> {
  if (challenge.ruleType === "TOTAL_CLASSES") {
    // Count all attendance during challenge period
    return prisma.attendance.count({
      where: { memberId, recordedAt: { gte: challenge.startsAt, lte: challenge.endsAt } },
    });
  }

  if (challenge.ruleType === "CLASSES_IN_DAYS" && challenge.ruleDays) {
    // Count attendance in the last N days
    const since = new Date(now);
    since.setDate(since.getDate() - challenge.ruleDays);
    return prisma.attendance.count({
      where: { memberId, recordedAt: { gte: since, lte: now } },
    });
  }

  if (challenge.ruleType === "CONSECUTIVE_CLASSES") {
    // Count consecutive class days (no gaps > 2 days)
    const attendances = await prisma.attendance.findMany({
      where: { memberId, recordedAt: { gte: challenge.startsAt, lte: challenge.endsAt } },
      orderBy: { recordedAt: "desc" },
      include: { classSession: { select: { date: true } } },
    });

    const dates = [...new Set(
      attendances.map((a) => a.classSession.date.toISOString().split("T")[0]),
    )].sort().reverse();

    let streak = 0;
    for (let i = 0; i < dates.length; i++) {
      if (i === 0) { streak = 1; continue; }
      const curr = new Date(dates[i]);
      const prev = new Date(dates[i - 1]);
      const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
      if (diff <= 3) streak++; // allow 1-2 day gaps (weekends, rest days)
      else break;
    }
    return streak;
  }

  return 0;
}

/** Update a member's stored attendance-challenge progress (after attendance registration). */
export async function updateChallengeProgress(memberId: string) {
  const now = new Date();

  // Find active attendance challenges where this member is enrolled and not done.
  const enrollments = await prisma.challengeProgress.findMany({
    where: {
      memberId,
      completed: false,
      challenge: { active: true, startsAt: { lte: now }, endsAt: { gte: now } },
    },
    include: { challenge: true },
  });

  for (const enrollment of enrollments) {
    const challenge = enrollment.challenge;
    if (isMetricRule(challenge.ruleType)) continue; // metric rankings are computed live

    const count = await computeAttendanceCount(challenge, memberId, now);
    const target = challenge.ruleTarget ?? Number.POSITIVE_INFINITY;
    const completed = count >= target;
    await prisma.challengeProgress.update({
      where: { id: enrollment.id },
      data: {
        currentCount: count,
        completed,
        completedAt: completed && !enrollment.completed ? now : enrollment.completedAt,
      },
    });
  }
}
