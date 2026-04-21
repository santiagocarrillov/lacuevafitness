"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, ChallengeRuleType } from "@/generated/prisma/client";

// ── Create challenge ────────────────────────────────────────────────

export async function createChallenge(data: {
  name: string;
  description?: string;
  reward?: string;
  ruleType: ChallengeRuleType;
  ruleTarget: number;
  ruleDays?: number;
  sede?: Sede;
  startsAt: string;
  endsAt: string;
}) {
  const challenge = await prisma.challenge.create({
    data: {
      name: data.name,
      description: data.description || undefined,
      reward: data.reward || undefined,
      ruleType: data.ruleType,
      ruleTarget: data.ruleTarget,
      ruleDays: data.ruleDays || undefined,
      sede: data.sede || undefined,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    },
  });

  revalidatePath("/dashboard/retos");
  return challenge;
}

// ── List challenges ─────────────────────────────────────────────────

export async function getChallenges(activeOnly = true) {
  return prisma.challenge.findMany({
    where: activeOnly ? { active: true } : {},
    orderBy: { startsAt: "desc" },
    include: {
      progress: {
        orderBy: { currentCount: "desc" },
        include: { member: { select: { firstName: true, lastName: true, sede: true } } },
      },
      _count: { select: { progress: true } },
    },
  });
}

// ── Get challenge detail ────────────────────────────────────────────

export async function getChallenge(id: string) {
  return prisma.challenge.findUnique({
    where: { id },
    include: {
      progress: {
        orderBy: { currentCount: "desc" },
        include: { member: { select: { id: true, firstName: true, lastName: true, sede: true } } },
      },
    },
  });
}

// ── Enroll member in challenge ──────────────────────────────────────

export async function enrollMemberInChallenge(challengeId: string, memberId: string) {
  const progress = await prisma.challengeProgress.upsert({
    where: { challengeId_memberId: { challengeId, memberId } },
    update: {},
    create: { challengeId, memberId, currentCount: 0 },
  });

  revalidatePath("/dashboard/retos");
  return progress;
}

// ── Enroll all active members of a sede ─────────────────────────────

export async function enrollAllActiveMembers(challengeId: string) {
  const challenge = await prisma.challenge.findUniqueOrThrow({
    where: { id: challengeId },
  });

  const where: any = { status: { in: ["ACTIVE", "TRIAL"] } };
  if (challenge.sede) where.sede = challenge.sede;

  const members = await prisma.member.findMany({ where, select: { id: true } });

  let enrolled = 0;
  for (const m of members) {
    await prisma.challengeProgress.upsert({
      where: { challengeId_memberId: { challengeId, memberId: m.id } },
      update: {},
      create: { challengeId, memberId: m.id, currentCount: 0 },
    });
    enrolled++;
  }

  revalidatePath("/dashboard/retos");
  return enrolled;
}

// ── Update progress from attendance (called after attendance registration) ──

export async function updateChallengeProgress(memberId: string) {
  const now = new Date();

  // Find active challenges where this member is enrolled
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
    let count = 0;

    if (challenge.ruleType === "TOTAL_CLASSES") {
      // Count all attendance during challenge period
      count = await prisma.attendance.count({
        where: {
          memberId,
          recordedAt: { gte: challenge.startsAt, lte: challenge.endsAt },
        },
      });
    } else if (challenge.ruleType === "CLASSES_IN_DAYS" && challenge.ruleDays) {
      // Count attendance in the last N days
      const since = new Date(now);
      since.setDate(since.getDate() - challenge.ruleDays);
      count = await prisma.attendance.count({
        where: {
          memberId,
          recordedAt: { gte: since, lte: now },
        },
      });
    } else if (challenge.ruleType === "CONSECUTIVE_CLASSES") {
      // Count consecutive class days (no gaps > 2 days)
      const attendances = await prisma.attendance.findMany({
        where: {
          memberId,
          recordedAt: { gte: challenge.startsAt, lte: challenge.endsAt },
        },
        orderBy: { recordedAt: "desc" },
        include: { classSession: { select: { date: true } } },
      });

      // Group by date, count consecutive unique dates
      const dates = [...new Set(
        attendances.map((a) => a.classSession.date.toISOString().split("T")[0]),
      )].sort().reverse();

      let streak = 0;
      for (let i = 0; i < dates.length; i++) {
        if (i === 0) {
          streak = 1;
          continue;
        }
        const curr = new Date(dates[i]);
        const prev = new Date(dates[i - 1]);
        const diff = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
        // Allow 1-2 day gaps (weekends, rest days)
        if (diff <= 3) {
          streak++;
        } else {
          break;
        }
      }
      count = streak;
    }

    const completed = count >= challenge.ruleTarget;
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

// ── Get member's active challenges with progress ────────────────────

export async function getMemberChallenges(memberId: string) {
  return prisma.challengeProgress.findMany({
    where: {
      memberId,
      challenge: { active: true },
    },
    include: {
      challenge: true,
    },
    orderBy: { challenge: { endsAt: "desc" } },
  });
}
