// "Cambiar por…": equivalent swaps for a logged food. Pure.
import { scaleFood, type FoodPer100 } from "./nutrients";

export type SwapFood = FoodPer100 & { id: string; name: string; isLiquid: boolean };

export type Swap = { food: SwapFood; grams: number; kcal: number; proteinG: number; carbsG: number; fatG: number };

/**
 * Same-group foods in the amount that matches the original kcal (rounded to
 * 5 g). Skips the original and anything needing an absurd amount (> 3× or
 * < ⅓ of the original grams) — those aren't practical swaps.
 */
export function equivalentSwaps(originalKcal: number, originalGrams: number | null, candidates: SwapFood[], excludeId?: string | null, limit = 8): Swap[] {
  if (!(originalKcal > 0)) return [];
  return candidates
    .filter((f) => f.id !== excludeId && f.kcal > 0)
    .map((f) => {
      const grams = Math.max(5, Math.round(((originalKcal / f.kcal) * 100) / 5) * 5);
      return { food: f, grams, ...scaleFood(f, grams) };
    })
    .filter((s) => !originalGrams || (s.grams <= originalGrams * 3 && s.grams >= originalGrams / 3))
    .sort((a, b) => b.proteinG - a.proteinG)
    .slice(0, limit);
}
