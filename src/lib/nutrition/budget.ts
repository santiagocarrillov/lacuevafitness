// "¿Cuánto me queda?" — the day's calorie budget per meal, redistributing what
// already happened. Pure. This is the heart of the "soluciones" feature: if
// lunch went over, the socio sees how much is left for the snack and dinner.
import { MEAL_LABEL, type MealKey } from "./meals";

export type MealBudget = {
  key: MealKey;
  planned: number; // target × split
  consumed: number;
  suggested: number | null; // kcal to aim for in this meal now (open meals only)
  closed: boolean; // has entries (or its time already passed and it was skipped? no — only entries)
};

export type DayBudget = {
  target: number;
  consumed: number;
  remaining: number;
  meals: MealBudget[];
  overMeals: { key: MealKey; over: number }[];
  message: string | null;
  nextOpenMeal: MealKey | null;
};

/**
 * A meal is "closed" once it has entries; open meals share what's left of the
 * day in proportion to their planned share. `currentMeal` (by clock) lets the
 * message point at the next meal even before anything is logged.
 */
export function computeDayBudget(input: {
  target: number;
  split: Partial<Record<MealKey, number>>; // % per meal, sums ~100
  meals: MealKey[];
  consumedByMeal: Partial<Record<MealKey, number>>;
  hasEntries: Partial<Record<MealKey, boolean>>;
}): DayBudget {
  const { target, split, meals, consumedByMeal, hasEntries } = input;
  const shareSum = meals.reduce((a, k) => a + (split[k] ?? 0), 0) || 1;
  const planned = (k: MealKey) => Math.round((target * (split[k] ?? 0)) / shareSum);
  const consumed = Math.round(meals.reduce((a, k) => a + (consumedByMeal[k] ?? 0), 0));
  const remaining = Math.round(target - consumed);

  const open = meals.filter((k) => !hasEntries[k]);
  const openShare = open.reduce((a, k) => a + (split[k] ?? 0), 0);
  const remainingForOpen = Math.max(0, remaining);

  const rows: MealBudget[] = meals.map((k) => {
    const closed = Boolean(hasEntries[k]);
    return {
      key: k,
      planned: planned(k),
      consumed: Math.round(consumedByMeal[k] ?? 0),
      closed,
      suggested: closed ? null : openShare > 0 ? Math.round((remainingForOpen * (split[k] ?? 0)) / openShare) : 0,
    };
  });

  const overMeals = rows
    .filter((r) => r.closed && r.consumed - r.planned > Math.max(50, r.planned * 0.1))
    .map((r) => ({ key: r.key, over: r.consumed - r.planned }));

  const nextOpenMeal = open[0] ?? null;
  let message: string | null = null;
  const openRows = rows.filter((r) => !r.closed);
  const list = openRows.map((r) => `${MEAL_LABEL[r.key].toLowerCase()} ≈${r.suggested}`).join(", ");
  if (remaining < 0) {
    message = `Te pasaste ${-remaining} kcal de tu meta de hoy.${openRows.length ? " Para lo que queda, elige opciones ligeras: vegetales y proteína magra." : ""}`;
  } else if (overMeals.length > 0 && openRows.length > 0) {
    const worst = overMeals.reduce((a, b) => (b.over > a.over ? b : a));
    message = `Te pasaste ${worst.over} kcal en ${MEAL_LABEL[worst.key].toLowerCase()} → te quedan ${remaining} kcal: ${list}.`;
  } else if (consumed > 0 && openRows.length > 0) {
    message = `Te quedan ${remaining} kcal: ${list}.`;
  }

  return { target, consumed, remaining, meals: rows, overMeals, message, nextOpenMeal };
}
