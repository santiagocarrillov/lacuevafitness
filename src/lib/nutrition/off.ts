// Open Food Facts → our Food fields. Pure. API: GET
// https://world.openfoodfacts.org/api/v2/product/{code}.json (free, needs a User-Agent).
import type { FoodInput } from "./food-input";

export const OFF_FIELDS = "code,product_name,product_name_es,brands,quantity,serving_size,serving_quantity,nutrition_data_per,nutriments";

type OffNutriments = Record<string, number | string | undefined>;
type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_es?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Only digits; EAN-8/12/13/14. Null if it can't be a product barcode. */
export function normalizeBarcode(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 14 ? d : null;
}

/**
 * Maps an OFF API response to a prefilled FoodInput, or null when the product
 * is missing or lacks the core nutrients (kcal + protein/carbs/fat per 100).
 * Energy falls back to kJ ÷ 4.184; sodium comes in g and is stored in mg.
 */
export function mapOffProduct(json: unknown, barcode: string): FoodInput | null {
  const j = json as { status?: number; product?: OffProduct } | null;
  if (!j || j.status !== 1 || !j.product) return null;
  const p = j.product;
  const n = p.nutriments ?? {};
  const kcal = num(n["energy-kcal_100g"]) ?? (num(n["energy_100g"]) !== null ? num(n["energy_100g"])! / 4.184 : null);
  const proteinG = num(n["proteins_100g"]);
  const carbsG = num(n["carbohydrates_100g"]);
  const fatG = num(n["fat_100g"]);
  if (kcal === null || proteinG === null || carbsG === null || fatG === null) return null;

  const name = (p.product_name_es || p.product_name || "").trim();
  const brand = (p.brands ?? "").split(",")[0]?.trim() || null;
  const isLiquid = /\b\d+([.,]\d+)?\s*(ml|cl|l)\b/i.test(p.quantity ?? "") || /\bml\b/i.test(p.serving_size ?? "");
  const servingGrams = num(p.serving_quantity);
  const sodium = num(n["sodium_100g"]);

  return {
    name: name || "Producto sin nombre",
    brand,
    barcode,
    kcal: Math.round(kcal),
    proteinG: r1(proteinG),
    carbsG: r1(carbsG),
    fatG: r1(fatG),
    fiberG: num(n["fiber_100g"]) !== null ? r1(num(n["fiber_100g"])!) : null,
    sugarG: num(n["sugars_100g"]) !== null ? r1(num(n["sugars_100g"])!) : null,
    satFatG: num(n["saturated-fat_100g"]) !== null ? r1(num(n["saturated-fat_100g"])!) : null,
    sodiumMg: sodium !== null ? Math.round(sodium * 1000) : null,
    isLiquid,
    portions: servingGrams && servingGrams > 0 && servingGrams < 5000 ? [{ label: "1 porción", grams: r1(servingGrams) }] : [],
    exchangeGroup: null,
  };
}
