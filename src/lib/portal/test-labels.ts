import type { TestKey } from "@/generated/prisma/client";

// betterDir: which direction is an improvement. Strength / reps / distance / hold
// time all improve going UP; timed efforts (Christine, 500m row) and the ring-row
// angle improve going DOWN. Used to color and narrate re-evaluation deltas.
export type TestSpec = { label: string; unit: string; betterDir: "up" | "down" };

export const TEST_LABELS: Record<TestKey, TestSpec> = {
  BACK_SQUAT_3RM: { label: "Sentadilla 3RM", unit: "kg", betterDir: "up" },
  DEADLIFT_3RM: { label: "Peso muerto 3RM", unit: "kg", betterDir: "up" },
  BENCH_PRESS_3RM: { label: "Press banca 3RM", unit: "kg", betterDir: "up" },
  PUSH_PRESS_3RM: { label: "Push press 3RM", unit: "kg", betterDir: "up" },
  DEAD_HANG_SECONDS: { label: "Dead hang", unit: "s", betterDir: "up" },
  PULL_UPS_MAX: { label: "Dominadas max", unit: "reps", betterDir: "up" },
  RING_ROW_ANGLE: { label: "Ring row", unit: "°", betterDir: "down" },
  PLANK_SECONDS: { label: "Plancha", unit: "s", betterDir: "up" },
  CHRISTINE_TIME_SECONDS: { label: "Christine", unit: "s", betterDir: "down" },
  COOPER_METERS: { label: "Cooper 12'", unit: "m", betterDir: "up" },
  CLEAN_JERK_1RM: { label: "Clean & jerk 1RM", unit: "kg", betterDir: "up" },
  SNATCH_1RM: { label: "Snatch 1RM", unit: "kg", betterDir: "up" },
  ROW_500M_SPRINT_SECONDS: { label: "Remo 500m", unit: "s", betterDir: "down" },
};

// Subset shown in the "Mis PRs" section of /portal/progreso. Order matters.
export const FEATURED_PRS: TestKey[] = [
  "BENCH_PRESS_3RM",
  "BACK_SQUAT_3RM",
  "COOPER_METERS",
  "DEAD_HANG_SECONDS",
];
