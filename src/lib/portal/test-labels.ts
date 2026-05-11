import type { TestKey } from "@/generated/prisma/client";

export type TestSpec = { label: string; unit: string };

export const TEST_LABELS: Record<TestKey, TestSpec> = {
  BACK_SQUAT_3RM: { label: "Sentadilla 3RM", unit: "kg" },
  DEADLIFT_3RM: { label: "Peso muerto 3RM", unit: "kg" },
  BENCH_PRESS_3RM: { label: "Press banca 3RM", unit: "kg" },
  PUSH_PRESS_3RM: { label: "Push press 3RM", unit: "kg" },
  DEAD_HANG_SECONDS: { label: "Dead hang", unit: "s" },
  PULL_UPS_MAX: { label: "Dominadas max", unit: "reps" },
  RING_ROW_ANGLE: { label: "Ring row", unit: "°" },
  PLANK_SECONDS: { label: "Plancha", unit: "s" },
  CHRISTINE_TIME_SECONDS: { label: "Christine", unit: "s" },
  COOPER_METERS: { label: "Cooper 12'", unit: "m" },
  CLEAN_JERK_1RM: { label: "Clean & jerk 1RM", unit: "kg" },
  SNATCH_1RM: { label: "Snatch 1RM", unit: "kg" },
  ROW_500M_SPRINT_SECONDS: { label: "Remo 500m", unit: "s" },
};

// Subset shown in the "Mis PRs" section of /portal/progreso. Order matters.
export const FEATURED_PRS: TestKey[] = [
  "BENCH_PRESS_3RM",
  "BACK_SQUAT_3RM",
  "COOPER_METERS",
  "DEAD_HANG_SECONDS",
];
