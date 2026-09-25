// Pure nutrient math. Foods store nutrients per 100 g (or 100 ml).

export type Macros = { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number | null };

export type FoodPer100 = Macros;

export type Portion = { label: string; grams: number };

/** Macros with every field present (fiber 0 when unknown). */
export type FullMacros = { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };

export const ZERO_MACROS: FullMacros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nutrients of `grams` of a food given per 100 g. */
export function scaleFood(food: FoodPer100, grams: number): FullMacros {
  const f = grams / 100;
  return {
    kcal: Math.round(food.kcal * f),
    proteinG: r1(food.proteinG * f),
    carbsG: r1(food.carbsG * f),
    fatG: r1(food.fatG * f),
    fiberG: r1((food.fiberG ?? 0) * f),
  };
}

export function sumMacros(items: Macros[]): FullMacros {
  const t = items.reduce<FullMacros>(
    (acc, m) => ({
      kcal: acc.kcal + (m.kcal || 0),
      proteinG: acc.proteinG + (m.proteinG || 0),
      carbsG: acc.carbsG + (m.carbsG || 0),
      fatG: acc.fatG + (m.fatG || 0),
      fiberG: acc.fiberG + (m.fiberG || 0),
    }),
    { ...ZERO_MACROS },
  );
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG), fiberG: r1(t.fiberG) };
}

export type IngredientForCalc = { grams: number | null; food: FoodPer100 | null };

/**
 * Per-serving nutrition of a recipe from its ingredients. Ingredients without a
 * linked food or grams contribute nothing; `coverage` says how many of them
 * were computable so the UI can warn about incomplete totals.
 */
export function recipePerServing(ingredients: IngredientForCalc[], servings: number) {
  const usable = ingredients.filter((i) => i.food && i.grams && i.grams > 0);
  const total = sumMacros(usable.map((i) => scaleFood(i.food!, i.grams!)));
  const s = Math.max(1, servings || 1);
  return {
    perServing: {
      kcal: Math.round(total.kcal / s),
      proteinG: r1(total.proteinG / s),
      carbsG: r1(total.carbsG / s),
      fatG: r1(total.fatG / s),
      fiberG: r1(total.fiberG / s),
    },
    total,
    computed: usable.length,
    ingredients: ingredients.length,
  };
}

/** Lowercase, strip accents and punctuation — used for Food.searchName and queries. */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** kcal implied by macros (4/4/9) — to sanity-check typed-in labels. */
export function kcalFromMacros(m: { proteinG: number; carbsG: number; fatG: number }): number {
  return Math.round(m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9);
}

/** Parses Food.portions JSON defensively. */
export function parsePortions(raw: unknown): Portion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({ label: String((p as Portion)?.label ?? "").trim(), grams: Number((p as Portion)?.grams) }))
    .filter((p) => p.label && Number.isFinite(p.grams) && p.grams > 0);
}
