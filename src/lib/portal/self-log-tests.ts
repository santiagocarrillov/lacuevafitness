import type { TestKey } from "@/generated/prisma/client";

/**
 * Lifts a socio may log a PR for from their own app. Deliberately a subset of
 * TestKey: only strength marks a member can reasonably measure themselves.
 * Timed/conditioning tests (Cooper, Christine, row sprint…) stay
 * coach-administered because they need controlled gym conditions.
 *
 * Plain module — NOT in the "use server" action file, which may only export
 * async functions.
 */
export const SELF_LOGGABLE_TESTS: { key: TestKey; label: string; unit: string }[] = [
  { key: "BACK_SQUAT_3RM", label: "Back squat (3RM)", unit: "kg" },
  { key: "BENCH_PRESS_3RM", label: "Bench press (3RM)", unit: "kg" },
  { key: "DEADLIFT_3RM", label: "Deadlift (3RM)", unit: "kg" },
  { key: "PUSH_PRESS_3RM", label: "Push press (3RM)", unit: "kg" },
  { key: "CLEAN_JERK_1RM", label: "Clean & jerk (1RM)", unit: "kg" },
  { key: "SNATCH_1RM", label: "Snatch (1RM)", unit: "kg" },
  { key: "PULL_UPS_MAX", label: "Dominadas (máx.)", unit: "reps" },
];

export const SELF_TEST_KEYS = new Set<string>(SELF_LOGGABLE_TESTS.map((t) => t.key));
