"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, can } from "@/lib/auth";
import { OFF_FIELDS, mapOffProduct, normalizeBarcode } from "@/lib/nutrition/off";
import { validateFoodInput, type FoodInput } from "@/lib/nutrition/food-input";
import { parsePortions } from "@/lib/nutrition/nutrients";
import type { DiaryFood } from "@/lib/actions/food-log";

const OFF_UA = "LaCueva/1.0 (lacuevasrxfit.com; nutricion)";

/** Open Food Facts lookup with a short timeout; null on miss/network error. */
async function fetchOff(code: string): Promise<FoodInput | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, {
      headers: { "User-Agent": OFF_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return mapOffProduct(await res.json(), code);
  } catch {
    return null;
  }
}

function toDiaryFood(
  f: { id: string; name: string; brand: string | null; kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null; isLiquid: boolean; portions: unknown; verifiedAt: Date | null; createdByMemberId: string | null },
  memberId: string,
): DiaryFood {
  return {
    kind: "food",
    id: f.id,
    name: f.name,
    brand: f.brand,
    kcal: f.kcal,
    proteinG: f.proteinG,
    carbsG: f.carbsG,
    fatG: f.fatG,
    fiberG: f.fiberG,
    isLiquid: f.isLiquid,
    portions: parsePortions(f.portions),
    verified: f.verifiedAt !== null,
    mine: f.createdByMemberId === memberId,
  };
}

export type BarcodeLookup =
  | { status: "found"; food: DiaryFood }
  | { status: "external"; prefill: FoodInput }
  | { status: "unknown"; barcode: string }
  | { status: "invalid" };

/**
 * Socio scanned a product: our DB first (a barcode is a commercial product, so
 * it's usable even if another socio added it and it isn't verified yet), then
 * Open Food Facts as a prefill they confirm, else they type the label.
 */
export async function lookupBarcode(raw: string): Promise<BarcodeLookup> {
  const { member } = await requireMember();
  const code = normalizeBarcode(raw);
  if (!code) return { status: "invalid" };
  const food = await prisma.food.findUnique({ where: { barcode: code } });
  if (food && food.active) return { status: "found", food: toDiaryFood(food, member.id) };
  const prefill = await fetchOff(code);
  return prefill ? { status: "external", prefill } : { status: "unknown", barcode: code };
}

/** Socio creates a food (scanned or typed). Usable right away; public once the nutritionist verifies it. */
export async function createMyFood(input: FoodInput & { fromOpenFoodFacts?: boolean }): Promise<DiaryFood> {
  const { member } = await requireMember();
  const data = validateFoodInput({ ...input, exchangeGroup: null, exchangeGrams: null });
  if (data.barcode) {
    const existing = await prisma.food.findUnique({ where: { barcode: data.barcode } });
    if (existing?.active) return toDiaryFood(existing, member.id); // someone beat them to it
  }
  const food = await prisma.food.create({
    data: {
      ...data,
      source: input.fromOpenFoodFacts ? "OPEN_FOOD_FACTS" : "MEMBER",
      sourceNote: input.fromOpenFoodFacts ? "Open Food Facts (escaneado por un socio)" : "Creado por un socio",
      createdByMemberId: member.id,
      verifiedAt: null,
    },
  });
  revalidatePath("/dashboard/nutricion/alimentos");
  return toDiaryFood(food, member.id);
}

export type StaffBarcodeLookup =
  | { status: "found"; foodId: string; name: string }
  | { status: "external"; prefill: FoodInput }
  | { status: "unknown"; barcode: string }
  | { status: "invalid" };

/** Same lookup for the nutritionist's food database screen. */
export async function lookupBarcodeStaff(raw: string): Promise<StaffBarcodeLookup> {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Sin permisos");
  const code = normalizeBarcode(raw);
  if (!code) return { status: "invalid" };
  const food = await prisma.food.findUnique({ where: { barcode: code }, select: { id: true, name: true } });
  if (food) return { status: "found", foodId: food.id, name: food.name };
  const prefill = await fetchOff(code);
  return prefill ? { status: "external", prefill } : { status: "unknown", barcode: code };
}
