// Recipe validation + nutrition math shared by the staff editor and socios'
// own recipes. Pure — callers fetch the linked foods and pass them in.
import { recipePerServing, type FoodPer100 } from "./nutrients";
import { isMealKey } from "./meals";

export type RecipeInput = {
  title: string;
  description?: string | null;
  instructions: string;
  servings: number;
  prepMinutes?: number | null;
  tags?: string[];
  mealKeys?: string[];
  photoUrl?: string | null;
  macrosFromIngredients: boolean;
  // Used only when macrosFromIngredients = false (typed from a label/table).
  manual?: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number | null };
  ingredients: { foodId?: string | null; label: string; grams?: number | null }[];
};

export type NormalizedIngredient = { foodId: string | null; label: string; grams: number | null; sortOrder: number };

/** Validates the fields and cleans the ingredient list. Throws Spanish messages. */
export function normalizeRecipeInput(input: RecipeInput) {
  const title = input.title?.trim();
  if (!title) throw new Error("El título es obligatorio.");
  if (title.length > 120) throw new Error("El título es muy largo.");
  const servings = Math.round(Number(input.servings));
  if (!(servings >= 1 && servings <= 50)) throw new Error("Las porciones deben estar entre 1 y 50.");
  const ingredients: NormalizedIngredient[] = input.ingredients
    .map((i, idx) => ({
      foodId: i.foodId || null,
      label: (i.label ?? "").trim().slice(0, 200),
      grams: i.grams && i.grams > 0 && i.grams < 10000 ? Math.round(i.grams * 10) / 10 : null,
      sortOrder: idx,
    }))
    .filter((i) => i.label || i.foodId)
    .slice(0, 60);
  const photoUrl = input.photoUrl?.trim() || null;
  if (photoUrl && !/^https:\/\//.test(photoUrl)) throw new Error("Foto inválida.");
  return {
    base: {
      title,
      description: input.description?.trim().slice(0, 2000) || null,
      instructions: (input.instructions ?? "").trim().slice(0, 10000),
      servings,
      prepMinutes: input.prepMinutes && input.prepMinutes > 0 ? Math.min(600, Math.round(input.prepMinutes)) : null,
      tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      mealKeys: (input.mealKeys ?? []).filter(isMealKey),
      photoUrl,
      macrosFromIngredients: input.macrosFromIngredients,
    },
    ingredients,
    foodIds: [...new Set(ingredients.map((i) => i.foodId).filter((x): x is string => Boolean(x)))],
  };
}

/** Per-serving nutrients: from the linked foods, or the typed-in values. */
export function recipeMacros(
  input: RecipeInput,
  ingredients: NormalizedIngredient[],
  servings: number,
  foodsById: Map<string, FoodPer100>,
) {
  if (input.macrosFromIngredients) {
    return recipePerServing(
      ingredients.map((i) => ({ grams: i.grams, food: i.foodId ? foodsById.get(i.foodId) ?? null : null })),
      servings,
    ).perServing;
  }
  const m = input.manual;
  if (!m || !(m.kcal >= 0)) throw new Error("Ingresa las calorías y macros por porción.");
  return { kcal: Math.round(m.kcal), proteinG: m.proteinG || 0, carbsG: m.carbsG || 0, fatG: m.fatG || 0, fiberG: m.fiberG ?? null };
}
