// "Sistema de intercambios": each food group has a reference exchange (e.g. one
// starch exchange ≈ 15 g of carbs). From a food's macros per 100 g we derive how
// many grams make one exchange, so the nutritionist can prescribe "2 almidones"
// and the socio can pick any food of that group in the right amount.

export const EXCHANGE_GROUPS = [
  "PROTEIN",
  "STARCH",
  "FRUIT",
  "VEGETABLE",
  "DAIRY",
  "FAT",
  "SUGAR",
  "FREE",
] as const;
export type ExchangeGroup = (typeof EXCHANGE_GROUPS)[number];

export const EXCHANGE_LABEL: Record<ExchangeGroup, string> = {
  PROTEIN: "Proteína",
  STARCH: "Almidón / cereal",
  FRUIT: "Fruta",
  VEGETABLE: "Vegetal",
  DAIRY: "Lácteo",
  FAT: "Grasa",
  SUGAR: "Azúcar",
  FREE: "Libre",
};

/** Which macro defines one exchange of each group, and how many grams of it. */
export const EXCHANGE_REFERENCE: Record<ExchangeGroup, { macro: "proteinG" | "carbsG" | "fatG"; grams: number } | null> = {
  PROTEIN: { macro: "proteinG", grams: 7 },
  STARCH: { macro: "carbsG", grams: 15 },
  FRUIT: { macro: "carbsG", grams: 15 },
  VEGETABLE: { macro: "carbsG", grams: 5 },
  DAIRY: { macro: "proteinG", grams: 8 },
  FAT: { macro: "fatG", grams: 5 },
  SUGAR: { macro: "carbsG", grams: 10 },
  FREE: null,
};

// Vegetables with almost no carbs (lettuce, spinach) would need absurd amounts;
// exchange lists cap them at about a cup.
const VEGETABLE_MAX_GRAMS = 150;

type Per100 = { proteinG: number; carbsG: number; fatG: number };

/** Grams of this food that make one exchange of `group` (rounded to 5 g), or null. */
export function exchangeGramsFor(group: ExchangeGroup | null | undefined, per100: Per100): number | null {
  if (!group) return null;
  const ref = EXCHANGE_REFERENCE[group];
  if (!ref) return null;
  const per100g = per100[ref.macro];
  if (!(per100g > 0)) return null;
  let grams = (ref.grams / per100g) * 100;
  if (group === "VEGETABLE") grams = Math.min(grams, VEGETABLE_MAX_GRAMS);
  return Math.max(5, Math.round(grams / 5) * 5);
}
