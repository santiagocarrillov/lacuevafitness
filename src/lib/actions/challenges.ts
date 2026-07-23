"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { Sede, ChallengeRuleType, TestKey } from "@/generated/prisma/client";
import { TEST_LABELS } from "@/lib/portal/test-labels";
import { isMetricRule, type MetricLeaderboard, type MetricLeaderboardEntry } from "@/lib/challenges/metrics";

const LB_PER_KG = 2.20462;

type ChallengeInput = {
  name: string;
  description?: string;
  reward?: string;
  ruleType: ChallengeRuleType;
  ruleTarget?: number | null;
  ruleDays?: number;
  metricTest?: TestKey | null;
  sede?: Sede;
  startsAt: string;
  endsAt: string;
};

// ── Create challenge ────────────────────────────────────────────────

export async function createChallenge(data: ChallengeInput) {
  const challenge = await prisma.challenge.create({
    data: {
      name: data.name,
      description: data.description || undefined,
      reward: data.reward || undefined,
      ruleType: data.ruleType,
      ruleTarget: data.ruleTarget ?? null,
      ruleDays: data.ruleDays || undefined,
      metricTest: data.ruleType === "TEST_IMPROVEMENT" ? (data.metricTest ?? null) : null,
      sede: data.sede || undefined,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    },
  });

  revalidatePath("/dashboard/retos");
  return challenge;
}

// ── Update challenge ────────────────────────────────────────────────

export async function updateChallenge(id: string, data: ChallengeInput) {
  const challenge = await prisma.challenge.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description ?? null,
      reward: data.reward ?? null,
      ruleType: data.ruleType,
      ruleTarget: data.ruleTarget ?? null,
      ruleDays: data.ruleDays ?? null,
      metricTest: data.ruleType === "TEST_IMPROVEMENT" ? (data.metricTest ?? null) : null,
      sede: data.sede ?? null,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
    },
  });

  // Editing rule/target/dates changes who qualifies — recompute stored
  // attendance progress so the ranking reflects reality (metric rules are live).
  await recomputeChallenge(id);

  revalidatePath("/dashboard/retos");
  return challenge;
}

// ── Delete challenge (soft delete — hides it from all views) ─────────

export async function deleteChallenge(id: string) {
  const challenge = await prisma.challenge.update({
    where: { id },
    data: { active: false },
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

// ── Attendance count for a member/challenge ─────────────────────────

type AttendanceChallenge = {
  ruleType: ChallengeRuleType;
  ruleDays: number | null;
  startsAt: Date;
  endsAt: Date;
};

async function computeAttendanceCount(
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

// ── Update progress from attendance (called after attendance registration) ──

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

// ── Recompute a whole challenge (used on edit + manual "Recalcular") ─
// Unlike updateChallengeProgress, this re-evaluates EVERY enrolled member,
// including already-completed ones, so raising/lowering the target can promote
// or demote members retroactively. Metric rankings are live, so this is a no-op
// for them beyond refreshing the page cache.

export async function recomputeChallenge(challengeId: string) {
  const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } });
  if (isMetricRule(challenge.ruleType)) {
    revalidatePath("/dashboard/retos");
    return { recomputed: 0 };
  }

  const now = new Date();
  const rows = await prisma.challengeProgress.findMany({ where: { challengeId } });

  for (const row of rows) {
    const count = await computeAttendanceCount(challenge, row.memberId, now);
    const target = challenge.ruleTarget ?? Number.POSITIVE_INFINITY;
    const completed = count >= target;
    await prisma.challengeProgress.update({
      where: { id: row.id },
      data: {
        currentCount: count,
        completed,
        // stamp when newly completed, clear when no longer completed, else keep
        completedAt: completed ? (row.completedAt ?? now) : null,
      },
    });
  }

  revalidatePath("/dashboard/retos");
  return { recomputed: rows.length };
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

// ── Metric (SRXFIT) leaderboard — computed live ─────────────────────

type MetricChallenge = {
  ruleType: ChallengeRuleType;
  ruleTarget: number | null;
  ruleDays: number | null;
  metricTest: TestKey | null;
  sede: Sede | null;
  startsAt: Date;
  endsAt: Date;
};

// Pick the starting point (last measurement before the challenge, or the first
// one inside the window if none) and the latest measurement inside the window.
function pickBaseLatest(
  rows: Array<{ at: Date; val: number }>,
  start: Date,
  end: Date,
): { baseline: number; latest: number } | null {
  const inWin = rows.filter((r) => r.at >= start && r.at <= end);
  if (inWin.length === 0) return null;
  const before = rows.filter((r) => r.at < start);
  const latest = inWin[inWin.length - 1].val;
  const baseline = before.length ? before[before.length - 1].val : inWin[0].val;
  return { baseline, latest };
}

function pctImprovement(baseline: number, latest: number, dir: "up" | "down"): number | null {
  if (baseline === 0) return null;
  const raw = dir === "up" ? latest - baseline : baseline - latest;
  return (raw / Math.abs(baseline)) * 100;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getMetricLeaderboard(
  challenge: MetricChallenge,
): Promise<MetricLeaderboard> {
  const now = new Date();
  const start = challenge.startsAt;
  const end = challenge.endsAt < now ? challenge.endsAt : now;
  const unit: "lb" | "%" = challenge.ruleType === "WEIGHT_LOSS" ? "lb" : "%";
  const threshold = challenge.ruleTarget;

  const members = await prisma.member.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      ...(challenge.sede ? { sede: challenge.sede } : {}),
    },
    select: { id: true, firstName: true, lastName: true, sede: true },
  });
  const memberIds = members.map((m) => m.id);
  const nameOf = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));
  const sedeOf = new Map(members.map((m) => [m.id, m.sede]));

  // score per member (positive = improvement); baseline/latest for display
  const scored = new Map<string, { baseline: number | null; latest: number | null; score: number }>();

  if (challenge.ruleType === "WEIGHT_LOSS" || challenge.ruleType === "WAIST_LOSS") {
    const isWeight = challenge.ruleType === "WEIGHT_LOSS";
    const comps = await prisma.bodyComposition.findMany({
      where: {
        memberId: { in: memberIds },
        measuredAt: { lte: end },
        ...(isWeight ? { weightKg: { not: null } } : { waistCm: { not: null } }),
        // Self-reported entries only count once a coach verifies them, so the
        // leaderboard can't be moved by an unchecked home measurement.
        ...OFFICIAL_ENTRY_WHERE,
      },
      orderBy: { measuredAt: "asc" },
      select: { memberId: true, measuredAt: true, weightKg: true, waistCm: true },
    });

    const byMember = new Map<string, Array<{ at: Date; val: number }>>();
    for (const c of comps) {
      const val = isWeight ? c.weightKg : c.waistCm;
      if (val == null) continue;
      const arr = byMember.get(c.memberId) ?? [];
      arr.push({ at: c.measuredAt, val });
      byMember.set(c.memberId, arr);
    }

    for (const [memberId, rows] of byMember) {
      const bl = pickBaseLatest(rows, start, end);
      if (!bl) continue;
      if (isWeight) {
        const lbBase = bl.baseline * LB_PER_KG;
        const lbLatest = bl.latest * LB_PER_KG;
        scored.set(memberId, {
          baseline: round1(lbBase),
          latest: round1(lbLatest),
          score: round1(lbBase - lbLatest),
        });
      } else {
        const pct = bl.baseline === 0 ? 0 : ((bl.baseline - bl.latest) / bl.baseline) * 100;
        scored.set(memberId, {
          baseline: round1(bl.baseline),
          latest: round1(bl.latest),
          score: round1(pct),
        });
      }
    }
  } else if (challenge.ruleType === "TEST_IMPROVEMENT") {
    const results = await prisma.testResult.findMany({
      where: {
        memberId: { in: memberIds },
        recordedAt: { lte: end },
        ...(challenge.metricTest ? { test: challenge.metricTest } : {}),
        // Same rule for PRs: unverified self-reported marks stay out of ranking.
        ...OFFICIAL_ENTRY_WHERE,
      },
      orderBy: { recordedAt: "asc" },
      select: { memberId: true, test: true, valueNumeric: true, recordedAt: true },
    });

    // group by member -> test -> rows
    const byMember = new Map<string, Map<TestKey, Array<{ at: Date; val: number }>>>();
    for (const r of results) {
      const perTest = byMember.get(r.memberId) ?? new Map();
      const arr = perTest.get(r.test) ?? [];
      arr.push({ at: r.recordedAt, val: r.valueNumeric });
      perTest.set(r.test, arr);
      byMember.set(r.memberId, perTest);
    }

    for (const [memberId, perTest] of byMember) {
      const pcts: number[] = [];
      let single: { baseline: number; latest: number } | null = null;
      for (const [test, rows] of perTest) {
        const bl = pickBaseLatest(rows, start, end);
        if (!bl) continue;
        const pct = pctImprovement(bl.baseline, bl.latest, TEST_LABELS[test].betterDir);
        if (pct == null) continue;
        pcts.push(pct);
        if (challenge.metricTest) single = bl;
      }
      if (pcts.length === 0) continue;
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      scored.set(memberId, {
        baseline: single ? round1(single.baseline) : null,
        latest: single ? round1(single.latest) : null,
        score: round1(avg),
      });
    }
  }

  const entries: MetricLeaderboardEntry[] = [...scored.entries()].map(([memberId, s]) => ({
    memberId,
    name: nameOf.get(memberId) ?? "—",
    sede: sedeOf.get(memberId)!,
    baseline: s.baseline,
    latest: s.latest,
    score: s.score,
    meets: threshold != null && s.score >= threshold,
  }));
  entries.sort((a, b) => b.score - a.score);

  return { unit, entries, missing: members.length - entries.length };
}
