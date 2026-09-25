// Validation + normalization for creating/editing a Food (shared by staff and,
// later, socio-created foods). Pure — no Prisma.
import { EXCHANGE_GROUPS, exchangeGramsFor, type ExchangeGroup } from "./exchanges";
import { kcalFromMacros, normalizeSearch, type Portion } from "./nutrients";

export type FoodInput = {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number | null;
  sugarG?: number | null;
  satFatG?: number | null;
  sodiumMg?: number | null;
  isLiquid?: boolean;
  portions?: Portion[];
  exchangeGroup?: ExchangeGroup | null;
  exchangeGrams?: number | null; // null → derived from the group reference
};

export type FoodData = Omit<Required<FoodInput>, "exchangeGrams"> & {
  searchName: string;
  exchangeGrams: number | null;
};

function optNum(v: number | null | undefined, field: string, max: number): number | null {
  if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${field}: valor fuera de rango.`);
  return Math.round(n * 10) / 10;
}

/** Validates a food (per 100 g) and returns the normalized DB fields. Throws Spanish messages. */
export function validateFoodInput(input: FoodInput): FoodData {
  const name = input.name?.trim();
  if (!name || name.length < 2) throw new Error("El nombre es obligatorio.");
  const kcal = optNum(input.kcal, "Calorías", 900);
  const proteinG = optNum(input.proteinG, "Proteína", 100);
  const carbsG = optNum(input.carbsG, "Carbohidratos", 100);
  const fatG = optNum(input.fatG, "Grasa", 100);
  if (kcal === null || proteinG === null || carbsG === null || fatG === null) {
    throw new Error("Calorías, proteína, carbohidratos y grasa son obligatorios.");
  }
  if (proteinG + carbsG + fatG > 101) throw new Error("Proteína + carbohidratos + grasa no pueden pasar de 100 g por 100 g.");
  // Catch typos (kcal ÷10) by checking kcal can't be far BELOW what the macros
  // imply. Fiber is left out (0–2 kcal/g, and some labels use specific Atwater factors). Kcal ABOVE the macros is legitimate
  // (alcohol, polyols), and ×10 typos upward already fail the 900 kcal cap.
  const fiber = Math.min(carbsG, optNum(input.fiberG, "Fibra", 100) ?? 0);
  const implied = kcalFromMacros({ proteinG, carbsG: carbsG - fiber, fatG });
  if (implied > 20 && kcal < implied - Math.max(60, implied * 0.35)) {
    throw new Error(`Las calorías (${kcal}) no cuadran con los macros (≈${implied} kcal). Revisa los valores.`);
  }
  const group = input.exchangeGroup ?? null;
  if (group && !(EXCHANGE_GROUPS as readonly string[]).includes(group)) throw new Error("Grupo inválido.");
  const barcode = input.barcode?.replace(/\D/g, "") || null;
  if (barcode && (barcode.length < 8 || barcode.length > 14)) throw new Error("Código de barras inválido.");
  const portions = (input.portions ?? [])
    .map((p) => ({ label: p.label.trim(), grams: Math.round(Number(p.grams) * 10) / 10 }))
    .filter((p) => p.label && p.grams > 0 && p.grams < 5000);
  const brand = input.brand?.trim() || null;

  return {
    name,
    brand,
    barcode,
    searchName: normalizeSearch(`${name} ${brand ?? ""}`),
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG: optNum(input.fiberG, "Fibra", 100),
    sugarG: optNum(input.sugarG, "Azúcar", 100),
    satFatG: optNum(input.satFatG, "Grasa saturada", 100),
    sodiumMg: optNum(input.sodiumMg, "Sodio", 50000),
    isLiquid: Boolean(input.isLiquid),
    portions,
    exchangeGroup: group,
    exchangeGrams:
      optNum(input.exchangeGrams, "Gramos por intercambio", 2000) ?? exchangeGramsFor(group, { proteinG, carbsG, fatG }),
  };
}

/** Prisma `where` for foods a socio may see: verified ones + the ones they created. */
export function foodVisibleToMember(memberId: string) {
  return {
    active: true,
    OR: [{ verifiedAt: { not: null } }, { createdByMemberId: memberId }],
  };
}

/** AND-of-tokens search over Food.searchName. */
export function foodSearchWhere(q: string) {
  const tokens = normalizeSearch(q).split(" ").filter((t) => t.length >= 2);
  return tokens.map((t) => ({ searchName: { contains: t } }));
}
