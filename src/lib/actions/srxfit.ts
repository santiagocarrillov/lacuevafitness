"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { Sede, TestKey } from "@/generated/prisma/client";
import { TEST_LABELS } from "@/lib/portal/test-labels";
import { evalScore, evalStatus } from "@/lib/srxfit/eval-score";
import { findTargetEvaluation, newEvaluationType, syncEvaluationCompletion } from "@/lib/srxfit/eval-panel";

// ─── Guards ──────────────────────────────────────────────────────────
// Server actions are public POST endpoints: every export checks its caller.

/**
 * Evaluaciones reports: same rule as the evaluaciones page (editTests or
 * manageMembers). Scoped admins always get their own sede.
 */
async function evalReportSede(requested: Sede | undefined): Promise<Sede | undefined> {
  const user = await requireAuth();
  if (!can.editTests(user) && !can.manageMembers(user)) throw new Error("Sin permisos");
  return getSedeScope(user) ?? requested;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function rangeBounds(from: string, to: string) {
  return {
    start: new Date(from + "T00:00:00"),
    end: new Date(to + "T23:59:59"),
  };
}

// ─── Body fat metrics ────────────────────────────────────────────────

export async function getBodyFatMetrics(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  sede = await evalReportSede(sede);
  const { start, end } = rangeBounds(from, to);
  const memberFilter = sede ? { sede } : {};

  // Members with body comps in the range
  const compsInRange = await prisma.bodyComposition.findMany({
    where: {
      measuredAt: { gte: start, lte: end },
      weightKg: { not: null },
      bodyFatPct: { not: null },
      member: memberFilter,
      ...OFFICIAL_ENTRY_WHERE,
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
        ...OFFICIAL_ENTRY_WHERE,
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
// Status comes from the weighted score (eval-score.ts), not from someone
// pressing "completar": ≥ 60 % → evaluado, something → parcial. Takes the best
// evaluation that started (or was completed) inside the period.

export async function getMembersEvalStatus(
  sede: Sede | undefined,
  from: string,
  to: string,
) {
  sede = await evalReportSede(sede);
  const { start, end } = rangeBounds(from, to);
  const sedeFilter = sede ? { sede } : {};
  const inPeriod = { OR: [{ startedAt: { gte: start, lte: end } }, { completedAt: { gte: start, lte: end } }] };

  const members = await prisma.member.findMany({
    where: { ...sedeFilter, status: { in: ["ACTIVE", "TRIAL"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sede: true,
      evaluations: {
        where: inPeriod,
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          startedAt: true,
          testResults: { select: { test: true } },
          bodyCompositions: { orderBy: { measuredAt: "desc" }, take: 1, select: { weightKg: true, bodyFatPct: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const lastEver = await prisma.evaluation.groupBy({
    by: ["memberId"],
    where: { memberId: { in: members.map((m) => m.id) } },
    _max: { startedAt: true },
  });
  const lastAt = new Map(lastEver.map((r) => [r.memberId, r._max.startedAt]));

  return members.map((m) => {
    const scored = m.evaluations.map((e) => ({
      e,
      score: evalScore({ tests: e.testResults.map((t) => t.test), body: e.bodyCompositions[0] }),
    }));
    const best = scored.sort((a, b) => b.score.pct - a.score.pct)[0];
    const pct = best?.score.pct ?? 0;
    return {
      memberId: m.id,
      name: `${m.firstName} ${m.lastName}`,
      sede: m.sede,
      status: evalStatus(pct),
      pct,
      evalId: best?.e.id ?? null,
      lastEvalAt: lastAt.get(m.id)?.toISOString() ?? null,
      testCount: best ? new Set(best.e.testResults.map((t) => t.test)).size : 0,
      hasBodyComp: !!best?.e.bodyCompositions[0]?.weightKg,
    };
  });
}

// ─── Single ad-hoc test result (no full battery) ─────────────────────
// A member may test just one movement (e.g. re-check every 4 weeks). This
// records ONE standalone TestResult with its own date + notes, not tied to a
// full evaluation. It still shows in the socio ficha and the client portal,
// where progress is read purely from `recordedAt` per test.
export async function createSingleTestResult(data: {
  memberId: string;
  test: TestKey;
  valueNumeric: number;
  unit: string;
  recordedAt?: string; // yyyy-mm-dd; defaults to today
  notes?: string;
}) {
  const user = await requireAuth();
  if (!can.editTests(user)) throw new Error("Sin permisos");

  await prisma.testResult.create({
    data: {
      memberId: data.memberId,
      test: data.test,
      valueNumeric: data.valueNumeric,
      unit: data.unit,
      // Noon avoids the date sliding to the previous day in Ecuador (UTC-5).
      recordedAt: data.recordedAt ? new Date(`${data.recordedAt}T12:00:00`) : new Date(),
      notes: data.notes ?? null,
      recordedByUserId: user.id,
    },
  });

  revalidatePath(`/dashboard/socios/${data.memberId}`);
  revalidatePath(`/dashboard/srxfit/evaluaciones/${data.memberId}`);
  return { success: true };
}

// Delete a single test result by id (used for ad-hoc tests that have no eval).
export async function deleteTestResultById(id: string, memberId: string) {
  const user = await requireAuth();
  if (!can.editTests(user)) throw new Error("Sin permisos");
  await prisma.testResult.delete({ where: { id } });
  revalidatePath(`/dashboard/socios/${memberId}`);
  revalidatePath(`/dashboard/srxfit/evaluaciones/${memberId}`);
  return { success: true };
}

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
  // The SRXFit hub is open to every staff role; scoped admins see their sede.
  const user = await requireAuth();
  if (user.role === "MEMBER") throw new Error("Sin permisos");
  sede = getSedeScope(user) ?? sede;
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
        ...OFFICIAL_ENTRY_WHERE,
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

// ─── Evaluation panel: one field at a time ────────────────────────────
// The panel over Evaluaciones saves every value on its own (no "Guardar
// evaluación"). The first value creates the evaluation; every save recomputes
// the weighted score and stamps/clears completedAt (≥ EVAL_COMPLETE_PCT).

async function memberForEdit(memberId: string) {
  const user = await requireAuth();
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, sede: true, secondarySede: true, status: true, _count: { select: { evaluations: true } } },
  });
  if (!member) throw new Error("Socio no encontrado");
  const scope = getSedeScope(user);
  if (scope && member.sede !== scope && member.secondarySede !== scope) throw new Error("Socio de otra sede");
  if (member.status !== "ACTIVE" && member.status !== "TRIAL") throw new Error("El socio no tiene membresía activa");
  return { user, member };
}

async function ensurePanelEvaluation(
  member: { id: string; _count: { evaluations: number } },
  userId: string,
  evaluationId: string | null,
  from: string,
  to: string,
) {
  if (evaluationId) {
    const ev = await prisma.evaluation.findUnique({ where: { id: evaluationId }, select: { id: true, memberId: true } });
    if (!ev || ev.memberId !== member.id) throw new Error("Evaluación no encontrada");
    return ev.id;
  }
  const existing = await findTargetEvaluation(member.id, from, to);
  if (existing) return existing.id;
  const created = await prisma.evaluation.create({
    data: { memberId: member.id, type: newEvaluationType(member._count.evaluations), coachId: userId },
  });
  return created.id;
}

function afterPanelSave(memberId: string) {
  revalidatePath("/dashboard/srxfit/evaluaciones");
  revalidatePath(`/dashboard/socios/${memberId}`);
}

export async function saveEvalTest(data: {
  memberId: string;
  evaluationId: string | null;
  from: string;
  to: string;
  test: TestKey;
  value: number | null; // null = borrar
}) {
  const { user, member } = await memberForEdit(data.memberId);
  if (!can.editTests(user)) throw new Error("Sin permisos");
  if (data.value != null && !(Number.isFinite(data.value) && data.value > 0)) throw new Error("Valor inválido");

  const evaluationId = await ensurePanelEvaluation(member, user.id, data.evaluationId, data.from, data.to);
  if (data.value == null) {
    await prisma.testResult.deleteMany({ where: { evaluationId, test: data.test } });
  } else {
    const existing = await prisma.testResult.findFirst({
      where: { evaluationId, test: data.test },
      orderBy: { recordedAt: "desc" },
    });
    const unit = TEST_LABELS[data.test].unit;
    if (existing) {
      await prisma.testResult.update({
        where: { id: existing.id },
        data: { valueNumeric: data.value, recordedByUserId: user.id, recordedAt: new Date() },
      });
    } else {
      await prisma.testResult.create({
        data: { memberId: member.id, evaluationId, test: data.test, valueNumeric: data.value, unit, recordedByUserId: user.id },
      });
    }
  }
  const pct = await syncEvaluationCompletion(evaluationId);
  afterPanelSave(member.id);
  return { evaluationId, pct };
}

const PANEL_BODY_FIELDS = ["weightKg", "heightCm", "bodyFatPct", "muscleMassPct", "waistCm", "hipCm", "basalMetabolism", "notes"] as const;
type PanelBodyField = (typeof PANEL_BODY_FIELDS)[number];

export async function saveEvalBodyField(data: {
  memberId: string;
  evaluationId: string | null;
  from: string;
  to: string;
  field: PanelBodyField;
  value: number | string | null;
}) {
  const { user, member } = await memberForEdit(data.memberId);
  if (!can.editTests(user) && !can.editBodyComp(user)) throw new Error("Sin permisos");
  if (!PANEL_BODY_FIELDS.includes(data.field)) throw new Error("Campo inválido");

  let value: number | string | null = data.value;
  if (data.field === "notes") {
    value = typeof value === "string" && value.trim() ? value.trim() : null;
  } else if (value != null) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Valor inválido");
    value = data.field === "basalMetabolism" ? Math.round(n) : n;
  }

  const evaluationId = await ensurePanelEvaluation(member, user.id, data.evaluationId, data.from, data.to);
  const existing = await prisma.bodyComposition.findFirst({
    where: { evaluationId },
    orderBy: { measuredAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    await prisma.bodyComposition.update({ where: { id: existing.id }, data: { [data.field]: value } });
  } else if (value != null) {
    await prisma.bodyComposition.create({
      data: { memberId: member.id, evaluationId, recordedById: user.id, [data.field]: value },
    });
  }
  const pct = await syncEvaluationCompletion(evaluationId);
  afterPanelSave(member.id);
  return { evaluationId, pct };
}

export async function saveEvalSummary(data: {
  memberId: string;
  evaluationId: string | null;
  from: string;
  to: string;
  summary: string;
}) {
  const { user, member } = await memberForEdit(data.memberId);
  if (!can.editTests(user)) throw new Error("Sin permisos");
  const summary = data.summary.trim() || null;
  if (!summary && !data.evaluationId) return { evaluationId: null, pct: 0 };
  const evaluationId = await ensurePanelEvaluation(member, user.id, data.evaluationId, data.from, data.to);
  await prisma.evaluation.update({ where: { id: evaluationId }, data: { summary } });
  const pct = await syncEvaluationCompletion(evaluationId);
  afterPanelSave(member.id);
  return { evaluationId, pct };
}
