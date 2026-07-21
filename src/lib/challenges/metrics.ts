import type { ChallengeRuleType, Sede } from "@/generated/prisma/client";

// Metric (ranking) rule types compute a live leaderboard from SRXFIT data
// instead of counting attendance. They don't store ChallengeProgress rows.
// Kept out of the "use server" actions file, which may only export async fns.
export const METRIC_RULES: ChallengeRuleType[] = [
  "WEIGHT_LOSS",
  "WAIST_LOSS",
  "TEST_IMPROVEMENT",
];

export function isMetricRule(t: ChallengeRuleType) {
  return METRIC_RULES.includes(t);
}

export type MetricLeaderboardEntry = {
  memberId: string;
  name: string;
  sede: Sede;
  baseline: number | null;
  latest: number | null;
  score: number; // lb lost, % waist reduction, or % test improvement (positive = better)
  meets: boolean; // score >= ruleTarget threshold (if any)
};

export type MetricLeaderboard = {
  unit: "lb" | "%";
  entries: MetricLeaderboardEntry[]; // ranked best-first; only members with enough data
  missing: number; // enrolled members without enough data to rank
};
