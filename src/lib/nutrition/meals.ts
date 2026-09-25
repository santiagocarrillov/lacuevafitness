// Canonical meal slots shared by plans, the food diary and MealLogEntry.mealKey.

export const MEAL_KEYS = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"] as const;
export type MealKey = (typeof MEAL_KEYS)[number];

export const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: "Desayuno",
  snack_am: "Media mañana",
  lunch: "Almuerzo",
  snack_pm: "Media tarde",
  dinner: "Merienda",
};

/** Default % of the day's kcal per meal (sums to 100). */
export const DEFAULT_MEAL_SPLIT: Record<MealKey, number> = {
  breakfast: 25,
  snack_am: 10,
  lunch: 35,
  snack_pm: 10,
  dinner: 20,
};

export function isMealKey(k: string): k is MealKey {
  return (MEAL_KEYS as readonly string[]).includes(k);
}

/** Normalizes a split so it sums to 100 (keeps proportions; falls back to default). */
export function normalizeMealSplit(split: Partial<Record<string, number>> | null | undefined): Record<MealKey, number> {
  const raw = MEAL_KEYS.map((k) => Math.max(0, Number(split?.[k] ?? 0)));
  const total = raw.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total <= 0) return { ...DEFAULT_MEAL_SPLIT };
  const out = {} as Record<MealKey, number>;
  MEAL_KEYS.forEach((k, i) => (out[k] = Math.round((raw[i] / total) * 1000) / 10));
  return out;
}
