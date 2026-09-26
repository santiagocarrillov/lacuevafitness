// Which daily target applies to a socio's diary. Pure.
import { DEFAULT_MEAL_SPLIT, MEAL_KEYS, normalizeMealSplit, type MealKey } from "./meals";

export type DailyTarget = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealSplit: Record<MealKey, number>;
  source: "PLAN" | "NUTRITIONIST" | "MEMBER" | "CALCULATED";
  meals: MealKey[]; // meals the diary shows
};

type StoredTarget = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealSplit: unknown;
  source: "CALCULATED" | "MEMBER" | "NUTRITIONIST";
};

/**
 * Precedence: the published plan's targets (the nutritionist's latest word) >
 * a NutritionTarget she set > one the socio set with the calculator. The meal
 * split comes from the stored target when present; the plan decides which
 * meals exist.
 */
export function resolveDailyTarget(
  plan: { targets: { kcal: number; proteinG: number; carbsG: number; fatG: number }; meals: MealKey[] } | null,
  stored: StoredTarget | null,
): DailyTarget | null {
  const meals = plan?.meals.length ? MEAL_KEYS.filter((k) => plan.meals.includes(k)) : [...MEAL_KEYS];
  const split = normalizeMealSplit(
    Object.fromEntries(meals.map((k) => [k, (stored?.mealSplit as Record<string, number> | null)?.[k] ?? DEFAULT_MEAL_SPLIT[k]])),
  );
  if (plan && plan.targets.kcal > 0) {
    return { ...plan.targets, mealSplit: split, source: "PLAN", meals };
  }
  if (stored) {
    return {
      kcal: stored.kcal,
      proteinG: stored.proteinG,
      carbsG: stored.carbsG,
      fatG: stored.fatG,
      mealSplit: split,
      source: stored.source === "NUTRITIONIST" ? "NUTRITIONIST" : stored.source === "MEMBER" ? "MEMBER" : "CALCULATED",
      meals,
    };
  }
  return null;
}
