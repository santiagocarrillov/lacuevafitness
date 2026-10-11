// Strength trend from the logged main sets (Manual SRXFIT v3, 9.5): the
// estimated 1RM carries error, so a lift only gets a trend with three or more
// sessions, read from the fitted line and never from one value.
// Pure — tested in scripts/test-tendencia-fuerza.ts.

import { estimate1Rm, exerciseKey, type MainSet } from "@/lib/self-log/main-set";

export const MIN_TREND_SESSIONS = 3;
/** Under this change of the fitted line the lift reads as stable. */
const STABLE_PCT = 2;

export type TrendSet = MainSet & { exercise: string; date: Date };
export type Direction = "up" | "flat" | "down";

export type LiftTrend = {
  exercise: string;
  sessions: number;
  /** Estimated 1RM per session, oldest first. */
  points: Array<{ date: Date; e1rm: number }>;
  last: TrendSet;
  best: number;
  /** null until the lift has MIN_TREND_SESSIONS sessions. */
  trend: { direction: Direction; deltaKg: number; pct: number } | null;
};

/** Least-squares change between the first and the last session. */
function fittedChange(values: number[]): { deltaKg: number; pct: number } {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  const slope = den ? num / den : 0;
  const start = meanY - slope * meanX;
  const deltaKg = Math.round(slope * (n - 1) * 10) / 10;
  return { deltaKg, pct: start > 0 ? Math.round((deltaKg / start) * 1000) / 10 : 0 };
}

/** One entry per lift, the most recently trained first. */
export function strengthTrends(sets: TrendSet[]): LiftTrend[] {
  const byLift = new Map<string, TrendSet[]>();
  for (const s of sets) {
    const key = exerciseKey(s.exercise);
    byLift.set(key, [...(byLift.get(key) ?? []), s]);
  }
  return [...byLift.values()]
    .map((rows) => {
      const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
      const points = sorted.map((s) => ({ date: s.date, e1rm: estimate1Rm(s) }));
      const last = sorted[sorted.length - 1];
      const change = sorted.length >= MIN_TREND_SESSIONS ? fittedChange(points.map((p) => p.e1rm)) : null;
      return {
        exercise: last.exercise,
        sessions: sorted.length,
        points,
        last,
        best: Math.max(...points.map((p) => p.e1rm)),
        trend: change
          ? { ...change, direction: (Math.abs(change.pct) < STABLE_PCT ? "flat" : change.pct > 0 ? "up" : "down") as Direction }
          : null,
      };
    })
    .sort((a, b) => b.last.date.getTime() - a.last.date.getTime());
}
