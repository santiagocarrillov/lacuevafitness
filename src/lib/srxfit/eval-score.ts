// How complete an SRXFIT evaluation is. Not every test weighs the same, and an
// evaluation does not need 100%: from EVAL_COMPLETE_PCT on it counts as done
// (evaluado) for compliance, the table and the socio's next-evaluation clock.
// Pure — tested in scripts/test-eval-score.ts.

import type { TestKey } from "@/generated/prisma/client";

export const EVAL_COMPLETE_PCT = 60;

export type EvalSlot = {
  key: string;
  label: string;
  weight: number;
  /** Any one of these tests fills the slot (pull-ups or ring row). */
  tests?: TestKey[];
  body?: "weightKg" | "bodyFatPct";
};

// Weights add up to 100. The optional Friday module (C&J, snatch, 500 m row)
// weighs 0: it never holds an evaluation back.
export const EVAL_SLOTS: EvalSlot[] = [
  { key: "peso", label: "Peso", weight: 10, body: "weightKg" },
  { key: "grasa", label: "% grasa", weight: 10, body: "bodyFatPct" },
  { key: "sentadilla", label: "Sentadilla 3RM", weight: 10, tests: ["BACK_SQUAT_3RM"] },
  { key: "peso-muerto", label: "Peso muerto 3RM", weight: 10, tests: ["DEADLIFT_3RM"] },
  // Both sedes test both presses since Bloque 3 (sep 2026).
  { key: "banca", label: "Press banca 3RM", weight: 5, tests: ["BENCH_PRESS_3RM"] },
  { key: "push-press", label: "Push press 3RM", weight: 5, tests: ["PUSH_PRESS_3RM"] },
  { key: "traccion", label: "Dominadas o ring row", weight: 10, tests: ["PULL_UPS_MAX", "RING_ROW_ANGLE"] },
  { key: "plancha", label: "Plancha", weight: 5, tests: ["PLANK_SECONDS"] },
  { key: "dead-hang", label: "Dead hang", weight: 5, tests: ["DEAD_HANG_SECONDS"] },
  { key: "christine", label: "Christine", weight: 15, tests: ["CHRISTINE_TIME_SECONDS"] },
  { key: "cooper", label: "Cooper 12'", weight: 15, tests: ["COOPER_METERS"] },
];

export type EvalScoreInput = {
  tests: Iterable<TestKey>;
  body?: { weightKg?: number | null; bodyFatPct?: number | null } | null;
};

export type EvalScore = {
  pct: number;
  complete: boolean;
  slots: Array<EvalSlot & { done: boolean }>;
};

export function evalScore({ tests, body }: EvalScoreInput): EvalScore {
  const have = new Set(tests);
  const slots = EVAL_SLOTS.map((s) => ({
    ...s,
    done: s.body ? body?.[s.body] != null : (s.tests ?? []).some((t) => have.has(t)),
  }));
  const pct = slots.reduce((acc, s) => acc + (s.done ? s.weight : 0), 0);
  return { pct, complete: pct >= EVAL_COMPLETE_PCT, slots };
}

export type EvalStatus = "evaluado" | "parcial" | "pendiente";

export function evalStatus(pct: number | null): EvalStatus {
  if (pct == null || pct <= 0) return "pendiente";
  return pct >= EVAL_COMPLETE_PCT ? "evaluado" : "parcial";
}

// One palette for gauge, legend, badges and the panel.
export const STATUS_COLOR: Record<EvalStatus, string> = {
  evaluado: "#2f855a",
  parcial: "#d97e0a",
  pendiente: "#e5533f",
};

export const STATUS_LABEL: Record<EvalStatus, string> = {
  evaluado: "Evaluado",
  parcial: "Parcial",
  pendiente: "Pendiente",
};
