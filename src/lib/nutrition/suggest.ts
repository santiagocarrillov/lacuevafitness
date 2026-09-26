// "Ideas para tu siguiente comida": candidates that fit the kcal left for a
// meal, favoring protein. Pure.

export type Candidate = {
  id: string; // stable key for UI
  kind: "plan" | "recipe" | "food";
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  // For foods: the grams this suggestion uses (scaled to fit), per-100 values kept by caller.
  grams?: number | null;
  servings?: number | null;
  portionLabel?: string | null;
  refId: string; // foodId / recipeId / plan option id
};

/**
 * Keeps candidates between 40% and 110% of the meal's budget, ranks plan
 * options first (it's what the nutritionist prescribed), then by how much of
 * the protein gap they close per kcal, and how close they land to the budget.
 */
export function suggestForMeal(candidates: Candidate[], budgetKcal: number, proteinGapG: number, limit = 5): Candidate[] {
  if (!(budgetKcal > 60)) return [];
  const fit = candidates.filter((c) => c.kcal >= budgetKcal * 0.4 && c.kcal <= budgetKcal * 1.1);
  const score = (c: Candidate) => {
    const kindBonus = c.kind === "plan" ? 2 : c.kind === "recipe" ? 0.5 : 0;
    const proteinDensity = c.kcal > 0 ? (c.proteinG * 4) / c.kcal : 0; // share of kcal from protein
    const gapWeight = proteinGapG > 15 ? 2 : 0.8;
    const closeness = 1 - Math.abs(budgetKcal - c.kcal) / budgetKcal;
    return kindBonus + proteinDensity * gapWeight + closeness;
  };
  const seen = new Set<string>();
  return fit
    .sort((a, b) => score(b) - score(a))
    .filter((c) => (seen.has(c.name) ? false : (seen.add(c.name), true)))
    .slice(0, limit);
}

/** Grams of a food (per-100 kcal) that land near `kcal`, rounded to 5 g and capped to a sane portion. */
export function gramsForKcal(kcalPer100: number, kcal: number, maxGrams = 400): number | null {
  if (!(kcalPer100 > 0) || !(kcal > 0)) return null;
  const g = Math.round(((kcal / kcalPer100) * 100) / 5) * 5;
  return g >= 5 ? Math.min(g, maxGrams) : null;
}
