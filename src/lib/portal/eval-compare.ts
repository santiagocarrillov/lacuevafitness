import type { TestKey } from "@/generated/prisma/client";
import { TEST_LABELS } from "./test-labels";
import { trend, type TrendInfo } from "@/lib/health-ranges";

export type TestResultLite = { test: TestKey; valueNumeric: number };

export type EvalTestComparison = {
  test: TestKey;
  label: string;
  unit: string;
  current: number;
  previous: number | null;
  trend: TrendInfo;
  reading: string;
};

/** Spanish, improvement-focused reading of a single test's change. */
export function narrative(ti: TrendInfo): string {
  if (ti.pctChange == null) return "Primera medición";
  if (ti.dir === "flat") return "Se mantiene";
  const abs = Math.abs(ti.pctChange);
  if (ti.isPositive === true) return `Mejoró ${abs.toFixed(0)}%`;
  if (ti.isPositive === false) return `Retrocedió ${abs.toFixed(0)}%`;
  return "Se mantiene";
}

/**
 * Build a per-test comparison of the current evaluation against the previous one.
 * One row per test present in the current eval (first occurrence wins), matched to
 * the same test in the previous eval. Direction-aware via TEST_LABELS.betterDir.
 */
export function compareEvaluations(
  currentTests: TestResultLite[],
  previousTests: TestResultLite[],
): EvalTestComparison[] {
  const prevMap = new Map<TestKey, number>();
  for (const t of previousTests) {
    if (!prevMap.has(t.test)) prevMap.set(t.test, t.valueNumeric);
  }

  const seen = new Set<TestKey>();
  const rows: EvalTestComparison[] = [];
  for (const t of currentTests) {
    if (seen.has(t.test)) continue;
    seen.add(t.test);
    const spec = TEST_LABELS[t.test];
    const previous = prevMap.has(t.test) ? prevMap.get(t.test)! : null;
    const ti = trend(t.valueNumeric, previous, spec.betterDir);
    rows.push({
      test: t.test,
      label: spec.label,
      unit: spec.unit,
      current: t.valueNumeric,
      previous,
      trend: ti,
      reading: narrative(ti),
    });
  }
  return rows;
}
