"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { Sede, EvaluationType, TestKey } from "@/generated/prisma/client";

// ─── Helpers ─────────────────────────────────────────────────────────

function rangeBounds(from: string, to: string) {
  return {
    start: new Date(from + "T00:00:00"),
    end: new Date(to + "T23:59:59"),
  };
}

// ─── Compliance report ───────────────────────────────────────────────

export async function getEvaluationCompliance(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);

  async function forSede(s: Sede | undefined) {
    const sedeFilter = s ? { sede: s } : {};
    const [totalActive, evaluated] = await Promise.all([
      prisma.member.count({
        where: { ...sedeFilter, status: { in: ["ACTIVE", "TRIAL"] } },
      }),
      prisma.member.count({
        where: {
          ...sedeFilter,
          status: { in: ["ACTIVE", "TRIAL"] },
          evaluations: {
            some: { completedAt: { gte: start, lte: end } },
          },
        },
      }),
    ]);
    return {
      label: s === "FITNESS_CENTER" ? "Fitness Center" : s === "XTREME" ? "Xtreme" : "Ambas sedes",
      sede: s,
      totalActive,
      evaluated,
      pct: totalActive > 0 ? Math.round((evaluated / totalActive) * 100) : 0,
    };
  }

  if (sede) {
    return [await forSede(sede)];
  }

  // Both sedes + combined
  const [fitness, xtreme, combined] = await Promise.all([
    forSede("FITNESS_CENTER"),
    forSede("XTREME"),
    forSede(undefined),
  ]);
  return [combined, fitness, xtreme];
}

// ─── Body fat metrics ────────────────────────────────────────────────

export async function getBodyFatMetrics(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const memberFilter = sede ? { sede } : {};

  // Members with body comps in the range
  const compsInRange = await prisma.bodyComposition.findMany({
    where: {
      measuredAt: { gte: start, lte: end },
      weightKg: { not: null },
      bodyFatPct: { not: null },
      member: memberFilter,
    },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, sede: true } },
    },
    orderBy: { measuredAt: "asc" },
  });

  // Group latest comp per member within range
  const latestInRange = new Map<string, typeof compsInRange[0]>();
  for (const c of compsInRange) {
    latestInRange.set(c.memberId, c);
  }

  let totalKgFatLost = 0;
  let membersImproved = 0;
  const topList: Array<{ name: string; kgFatLost: number; sede: string }> = [];

  for (const [memberId, latest] of latestInRange) {
    const baseline = await prisma.bodyComposition.findFirst({
      where: {
        memberId,
        measuredAt: { lt: start },
        weightKg: { not: null },
        bodyFatPct: { not: null },
      },
      orderBy: { measuredAt: "desc" },
    });
    if (!baseline) continue;

    const fatStart = baseline.weightKg! * (baseline.bodyFatPct! / 100);
    const fatEnd = latest.weightKg! * (latest.bodyFatPct! / 100);
    const lost = parseFloat((fatStart - fatEnd).toFixed(2));

    if (lost > 0) {
      totalKgFatLost += lost;
      membersImproved++;
      topList.push({
        name: `${latest.member.firstName} ${latest.member.lastName}`,
        kgFatLost: lost,
        sede: latest.member.sede,
      });
    }
  }

  return {
    totalKgFatLost: parseFloat(totalKgFatLost.toFixed(1)),
    membersImproved,
    top: topList.sort((a, b) => b.kgFatLost - a.kgFatLost).slice(0, 10),
  };
}

// ─── Members eval status list ────────────────────────────────────────

export async function getMembersEvalStatus(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};

  const members = await prisma.member.findMany({
    where: { ...sedeFilter, status: { in: ["ACTIVE", "TRIAL"] } },
    include: {
      evaluations: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          testResults: { select: { test: true } },
          bodyCompositions: { select: { id: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return members.map((m) => {
    const last = m.evaluations[0];
    const inRange = last && last.startedAt >= start && last.startedAt <= end;
    const status: "evaluado" | "parcial" | "pendiente" = inRange && last.completedAt
      ? "evaluado"
      : inRange && (last.testResults.length > 0 || last.bodyCompositions.length > 0)
      ? "parcial"
      : "pendiente";

    return {
      memberId: m.id,
      name: `${m.firstName} ${m.lastName}`,
      sede: m.sede,
      status,
      evalId: inRange ? last?.id ?? null : null,
      lastEvalAt: last?.startedAt?.toISOString() ?? null,
      completedAt: last?.completedAt?.toISOString() ?? null,
      testCount: inRange ? last?.testResults.length ?? 0 : 0,
      hasBodyComp: inRange ? (last?.bodyCompositions.length ?? 0) > 0 : false,
    };
  });
}

// ─── Member eval detail ──────────────────────────────────────────────

export async function getMemberEvalDetail(memberId: string) {
  const user = await requireAuth();
  if (!can.editTests(user)) throw new Error("Sin permisos");

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      trainingLevels: { orderBy: { assignedAt: "desc" }, take: 1 },
    },
  });
  if (!member) throw new Error("Socio no encontrado");

  // Get all evaluations ordered by most recent
  const evaluations = await prisma.evaluation.findMany({
    where: { memberId },
    include: {
      testResults: { orderBy: { recordedAt: "desc" } },
      bodyCompositions: { orderBy: { measuredAt: "desc" } },
      coach: { select: { fullName: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  return { member, evaluations };
}

// ─── Start or get open evaluation ────────────────────────────────────

export async function getOrStartEvaluation(
  memberId: string,
  type: EvaluationType,
  cycleNumber?: number,
) {
  const user = await requireAuth();
  if (!can.editTests(user)) throw new Error("Sin permisos");

  // Look for an open (incomplete) evaluation of this type
  const existing = await prisma.evaluation.findFirst({
    where: {
      memberId,
      type,
      ...(cycleNumber !== undefined ? { cycleNumber } : {}),
      completedAt: null,
    },
    include: {
      testResults: { orderBy: { recordedAt: "desc" } },
      bodyCompositions: { orderBy: { measuredAt: "desc" }, take: 1 },
    },
    orderBy: { startedAt: "desc" },
  });
  if (existing) return existing;

  const created = await prisma.evaluation.create({
    data: {
      memberId,
      type,
      ...(cycleNumber !== undefined ? { cycleNumber } : {}),
      coachId: user.id,
    },
    include: {
      testResults: true,
      bodyCompositions: true,
    },
  });
  revalidatePath(`/dashboard/srxfit/evaluaciones/${memberId}`);
  return created;
}

// ─── Upsert test result ───────────────────────────────────────────────

export async function upsertTestResult(data: {
  evaluationId: string;
  memberId: string;
  test: TestKey;
  valueNumeric: number;
  unit: string;
  notes?: string;
}) {
  const user = await requireAuth();
  if (!can.editTests(user)) throw new Error("Sin permisos");

  const existing = await prisma.testResult.findFirst({
    where: { evaluationId: data.evaluationId, test: data.test },
    orderBy: { recordedAt: "desc" },
  });

  if (existing) {
    await prisma.testResult.update({
      where: { id: existing.id },
      data: {
        valueNumeric: data.valueNumeric,
        unit: data.unit,
        notes: data.notes ?? null,
        recordedByUserId: user.id,
        recordedAt: new Date(),
      },
    });
  } else {
    await prisma.testResult.create({
      data: {
        memberId: data.memberId,
        evaluationId: data.evaluationId,
        test: data.test,
        valueNumeric: data.valueNumeric,
        unit: data.unit,
        notes: data.notes ?? null,
        recordedByUserId: user.id,
      },
    });
  }

  revalidatePath(`/dashboard/srxfit/evaluaciones/${data.memberId}`);
  revalidatePath("/dashboard/srxfit/evaluaciones");
  return { success: true };
}

// ─── Upsert body composition ──────────────────────────────────────────

export async function upsertBodyComposition(data: {
  evaluationId: string;
  memberId: string;
  weightKg?: number;
  heightCm?: number;
  bodyFatPct?: number;
  muscleMassKg?: number;
  waterPct?: number;
  basalMetabolism?: number;
  notes?: string;
}) {
  const user = await requireAuth();
  if (!can.editTests(user) && !can.editBodyComp(user)) throw new Error("Sin permisos");

  const existing = await prisma.bodyComposition.findFirst({
    where: { evaluationId: data.evaluationId },
    orderBy: { measuredAt: "desc" },
  });

  if (existing) {
    await prisma.bodyComposition.update({
      where: { id: existing.id },
      data: {
        weightKg: data.weightKg ?? null,
        heightCm: data.heightCm ?? null,
        bodyFatPct: data.bodyFatPct ?? null,
        muscleMassKg: data.muscleMassKg ?? null,
        waterPct: data.waterPct ?? null,
        basalMetabolism: data.basalMetabolism ?? null,
        notes: data.notes ?? null,
        measuredAt: new Date(),
      },
    });
  } else {
    await prisma.bodyComposition.create({
      data: {
        memberId: data.memberId,
        evaluationId: data.evaluationId,
        weightKg: data.weightKg ?? null,
        heightCm: data.heightCm ?? null,
        bodyFatPct: data.bodyFatPct ?? null,
        muscleMassKg: data.muscleMassKg ?? null,
        waterPct: data.waterPct ?? null,
        basalMetabolism: data.basalMetabolism ?? null,
        notes: data.notes ?? null,
      },
    });
  }

  revalidatePath(`/dashboard/srxfit/evaluaciones/${data.memberId}`);
  return { success: true };
}

// ─── Complete evaluation ──────────────────────────────────────────────

export async function completeEvaluation(evaluationId: string, memberId: string, summary?: string) {
  const user = await requireAuth();
  if (!can.editTests(user)) throw new Error("Sin permisos");

  await prisma.evaluation.update({
    where: { id: evaluationId },
    data: { completedAt: new Date(), summary: summary ?? null },
  });

  revalidatePath(`/dashboard/srxfit/evaluaciones/${memberId}`);
  revalidatePath("/dashboard/srxfit/evaluaciones");
  return { success: true };
}

// ─── Training level assignment ────────────────────────────────────────

export async function assignTrainingLevel(
  memberId: string,
  level: "LEVEL_1" | "LEVEL_2" | "LEVEL_3",
  rationale?: string,
) {
  const user = await requireAuth();
  if (!can.editTests(user)) throw new Error("Sin permisos");

  await prisma.trainingLevelAssignment.create({
    data: { memberId, level, assignedByUserId: user.id, rationale: rationale ?? null },
  });

  revalidatePath(`/dashboard/srxfit/evaluaciones/${memberId}`);
  return { success: true };
}

// ─── Quick stats for hub ──────────────────────────────────────────────

export async function getSrxfitHubStats(sede: Sede | undefined) {
  const sedeFilter = sede ? { sede } : {};
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalMembers, evalsThisMonth, withBodyComp, completedEvals] = await Promise.all([
    prisma.member.count({ where: { ...sedeFilter, status: { in: ["ACTIVE", "TRIAL"] } } }),
    prisma.evaluation.count({
      where: {
        startedAt: { gte: monthStart },
        member: sedeFilter,
      },
    }),
    prisma.bodyComposition.count({
      where: {
        measuredAt: { gte: monthStart },
        member: sedeFilter,
      },
    }),
    prisma.evaluation.count({
      where: {
        completedAt: { gte: monthStart },
        member: sedeFilter,
      },
    }),
  ]);

  return { totalMembers, evalsThisMonth, completedEvals, withBodyComp };
}
