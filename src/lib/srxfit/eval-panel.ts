// Data for the evaluation panel that opens over Evaluaciones (?socio=…).
// Server only, no auth — the page and the actions check permissions.
//
// Which evaluation the panel edits: the latest one that started inside the
// selected period, or in the last EVAL_WINDOW_DAYS (a battery takes a week of
// classes and can straddle the 1st of the month). None → the first saved value
// creates it, so opening a socio never leaves an empty evaluation behind.

import { prisma } from "@/lib/prisma";
import type { BodyComposition, EvaluationType, Sede, TestKey } from "@/generated/prisma/client";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { evalScore } from "./eval-score";

const DAY = 86_400_000;
export const EVAL_WINDOW_DAYS = 21;

export function evalWindow(from: string, to: string, now = new Date()) {
  const rangeStart = new Date(`${from}T00:00:00`);
  const recent = new Date(now.getTime() - EVAL_WINDOW_DAYS * DAY);
  return {
    start: rangeStart < recent ? rangeStart : recent,
    end: new Date(`${to}T23:59:59`),
  };
}

export async function findTargetEvaluation(memberId: string, from: string, to: string) {
  const { start, end } = evalWindow(from, to);
  return prisma.evaluation.findFirst({
    where: { memberId, startedAt: { gte: start, lte: end } },
    orderBy: { startedAt: "desc" },
  });
}

export function newEvaluationType(previousCount: number): EvaluationType {
  return previousCount === 0 ? "ONBOARDING" : "CYCLE_9_WEEK";
}

/** Recompute the weighted score and keep completedAt in step with it. */
export async function syncEvaluationCompletion(evaluationId: string) {
  const ev = await prisma.evaluation.findUnique({
    where: { id: evaluationId },
    include: {
      testResults: { select: { test: true } },
      bodyCompositions: { orderBy: { measuredAt: "desc" }, take: 1 },
    },
  });
  if (!ev) return 0;
  const { pct, complete } = evalScore({ tests: ev.testResults.map((t) => t.test), body: ev.bodyCompositions[0] });
  if (complete && !ev.completedAt) {
    await prisma.evaluation.update({ where: { id: ev.id }, data: { completedAt: new Date() } });
  } else if (!complete && ev.completedAt) {
    await prisma.evaluation.update({ where: { id: ev.id }, data: { completedAt: null } });
  }
  return pct;
}

export type PanelBody = Pick<
  BodyComposition,
  "weightKg" | "heightCm" | "bodyFatPct" | "muscleMassPct" | "waistCm" | "hipCm" | "basalMetabolism" | "notes"
>;

export type EvalPanelData = {
  member: { id: string; name: string; sede: Sede; level: string | null; active: boolean };
  evaluation: {
    id: string;
    type: EvaluationType;
    startedAt: string;
    summary: string | null;
  } | null;
  tests: Partial<Record<TestKey, number>>;
  body: PanelBody | null;
  previous: {
    tests: Partial<Record<TestKey, { value: number; at: string }>>;
    body: (PanelBody & { at: string }) | null;
  };
  history: Array<{ id: string; type: EvaluationType; startedAt: string; pct: number }>;
};

const BODY_SELECT = {
  weightKg: true, heightCm: true, bodyFatPct: true, muscleMassPct: true, muscleMassKg: true,
  waistCm: true, hipCm: true, basalMetabolism: true, notes: true, measuredAt: true,
} as const;

function toPanelBody(b: {
  weightKg: number | null; heightCm: number | null; bodyFatPct: number | null; muscleMassPct: number | null;
  muscleMassKg: number | null; waistCm: number | null; hipCm: number | null; basalMetabolism: number | null; notes: string | null;
}): PanelBody {
  // Legacy rows stored muscle in kg; show it as % of body weight.
  const musclePct = b.muscleMassPct ?? (b.muscleMassKg != null && b.weightKg ? Math.round((b.muscleMassKg / b.weightKg) * 1000) / 10 : null);
  return {
    weightKg: b.weightKg, heightCm: b.heightCm, bodyFatPct: b.bodyFatPct, muscleMassPct: musclePct,
    waistCm: b.waistCm, hipCm: b.hipCm, basalMetabolism: b.basalMetabolism, notes: b.notes,
  };
}

export async function loadEvalPanel(memberId: string, from: string, to: string): Promise<EvalPanelData | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true, firstName: true, lastName: true, sede: true, status: true,
      trainingLevels: { orderBy: { assignedAt: "desc" }, take: 1, select: { level: true } },
    },
  });
  if (!member) return null;

  const target = await findTargetEvaluation(memberId, from, to);
  const [targetFull, history, pastTests, pastBody] = await Promise.all([
    target
      ? prisma.evaluation.findUnique({
          where: { id: target.id },
          include: {
            testResults: { orderBy: { recordedAt: "desc" } },
            bodyCompositions: { orderBy: { measuredAt: "desc" }, take: 1, select: BODY_SELECT },
          },
        })
      : null,
    prisma.evaluation.findMany({
      where: { memberId, ...(target ? { id: { not: target.id } } : {}) },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: {
        testResults: { select: { test: true } },
        bodyCompositions: { orderBy: { measuredAt: "desc" }, take: 1, select: { weightKg: true, bodyFatPct: true } },
      },
    }),
    prisma.testResult.findMany({
      where: {
        memberId,
        ...OFFICIAL_ENTRY_WHERE,
        ...(target ? { evaluationId: { not: target.id }, recordedAt: { lt: target.startedAt } } : {}),
      },
      orderBy: { recordedAt: "desc" },
      select: { test: true, valueNumeric: true, recordedAt: true },
    }),
    prisma.bodyComposition.findFirst({
      where: {
        memberId,
        ...OFFICIAL_ENTRY_WHERE,
        weightKg: { not: null },
        ...(target ? { evaluationId: { not: target.id }, measuredAt: { lt: target.startedAt } } : {}),
      },
      orderBy: { measuredAt: "desc" },
      select: BODY_SELECT,
    }),
  ]);

  const tests: Partial<Record<TestKey, number>> = {};
  for (const t of targetFull?.testResults ?? []) if (tests[t.test] === undefined) tests[t.test] = t.valueNumeric;

  const prevTests: EvalPanelData["previous"]["tests"] = {};
  for (const t of pastTests) if (!prevTests[t.test]) prevTests[t.test] = { value: t.valueNumeric, at: t.recordedAt.toISOString() };

  const body = targetFull?.bodyCompositions[0];

  return {
    member: {
      id: member.id,
      name: `${member.firstName} ${member.lastName}`,
      sede: member.sede,
      level: member.trainingLevels[0]?.level ?? null,
      active: member.status === "ACTIVE" || member.status === "TRIAL",
    },
    evaluation: targetFull
      ? { id: targetFull.id, type: targetFull.type, startedAt: targetFull.startedAt.toISOString(), summary: targetFull.summary }
      : null,
    tests,
    body: body ? toPanelBody(body) : null,
    previous: {
      tests: prevTests,
      body: pastBody ? { ...toPanelBody(pastBody), at: pastBody.measuredAt.toISOString() } : null,
    },
    history: history.map((h) => ({
      id: h.id,
      type: h.type,
      startedAt: h.startedAt.toISOString(),
      pct: evalScore({ tests: h.testResults.map((t) => t.test), body: h.bodyCompositions[0] }).pct,
    })),
  };
}
