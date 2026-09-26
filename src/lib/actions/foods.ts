"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { foodSearchWhere, validateFoodInput, type FoodInput } from "@/lib/nutrition/food-input";
import { parsePortions, type Portion } from "@/lib/nutrition/nutrients";
import type { ExchangeGroup, Prisma, User } from "@/generated/prisma/client";

async function requireNutrition(): Promise<User> {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Sin permisos");
  return user;
}

export type FoodRow = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  satFatG: number | null;
  sodiumMg: number | null;
  isLiquid: boolean;
  portions: Portion[];
  exchangeGroup: ExchangeGroup | null;
  exchangeGrams: number | null;
  source: string;
  sourceNote: string | null;
  verified: boolean;
  active: boolean;
  createdByMember: string | null;
};

const FOOD_SELECT = {
  id: true,
  name: true,
  brand: true,
  barcode: true,
  kcal: true,
  proteinG: true,
  carbsG: true,
  fatG: true,
  fiberG: true,
  sugarG: true,
  satFatG: true,
  sodiumMg: true,
  isLiquid: true,
  portions: true,
  exchangeGroup: true,
  exchangeGrams: true,
  source: true,
  sourceNote: true,
  verifiedAt: true,
  active: true,
  createdByMember: { select: { firstName: true, lastName: true } },
} satisfies Prisma.FoodSelect;

type FoodSelected = Prisma.FoodGetPayload<{ select: typeof FOOD_SELECT }>;

function toRow(f: FoodSelected): FoodRow {
  const { verifiedAt, createdByMember, portions, ...rest } = f;
  return {
    ...rest,
    portions: parsePortions(portions),
    verified: verifiedAt !== null,
    createdByMember: createdByMember ? `${createdByMember.firstName} ${createdByMember.lastName}` : null,
  };
}

/** Rank: verified first, then shorter (more generic) names, then alphabetical. */
function rank(a: FoodRow, b: FoodRow) {
  return Number(b.verified) - Number(a.verified) || a.name.length - b.name.length || a.name.localeCompare(b.name, "es");
}

/** Staff food picker (recipes, plans): every active food, verified first. */
export async function searchFoods(q: string, limit = 20): Promise<FoodRow[]> {
  await requireNutrition();
  const where = foodSearchWhere(q);
  if (where.length === 0) return [];
  const rows = await prisma.food.findMany({
    where: { active: true, AND: where },
    select: FOOD_SELECT,
    take: 80,
  });
  return rows.map(toRow).sort(rank).slice(0, limit);
}

export type FoodListFilter = "todos" | "sin-verificar" | "archivados" | ExchangeGroup;

/** Admin table of the food database. */
export async function listFoods(opts: { q?: string; filter?: FoodListFilter; page?: number }) {
  await requireNutrition();
  const pageSize = 50;
  const page = Math.max(1, opts.page ?? 1);
  const filter = opts.filter ?? "todos";
  const where: Prisma.FoodWhereInput = {
    active: filter !== "archivados",
    ...(filter === "sin-verificar" ? { verifiedAt: null } : {}),
    ...(filter !== "todos" && filter !== "sin-verificar" && filter !== "archivados" ? { exchangeGroup: filter } : {}),
    ...(opts.q ? { AND: foodSearchWhere(opts.q) } : {}),
  };
  const [rows, total, unverified] = await Promise.all([
    prisma.food.findMany({
      where,
      select: FOOD_SELECT,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.food.count({ where }),
    prisma.food.count({ where: { active: true, verifiedAt: null } }),
  ]);
  return { rows: rows.map(toRow), total, page, pageSize, unverified };
}

async function assertBarcodeFree(barcode: string | null, exceptId?: string) {
  if (!barcode) return;
  const other = await prisma.food.findUnique({ where: { barcode }, select: { id: true, name: true } });
  if (other && other.id !== exceptId) throw new Error(`Ese código de barras ya es de "${other.name}".`);
}

/** Staff-created foods are verified from the start. */
export async function createFood(input: FoodInput) {
  const user = await requireNutrition();
  const data = validateFoodInput(input);
  await assertBarcodeFree(data.barcode);
  const food = await prisma.food.create({
    data: {
      ...data,
      source: "STAFF",
      sourceNote: "Creado por nutrición",
      createdByUserId: user.id,
      verifiedAt: new Date(),
      verifiedById: user.id,
    },
    select: FOOD_SELECT,
  });
  revalidatePath("/dashboard/nutricion/alimentos");
  return toRow(food);
}

export async function updateFood(id: string, input: FoodInput) {
  await requireNutrition();
  const data = validateFoodInput(input);
  await assertBarcodeFree(data.barcode, id);
  const food = await prisma.food.update({ where: { id }, data, select: FOOD_SELECT });
  revalidatePath("/dashboard/nutricion/alimentos");
  return toRow(food);
}

/** Marks a socio-created / imported food as checked → public for everyone. */
export async function verifyFood(id: string) {
  const user = await requireNutrition();
  await prisma.food.update({ where: { id }, data: { verifiedAt: new Date(), verifiedById: user.id } });
  revalidatePath("/dashboard/nutricion/alimentos");
}

export async function setFoodActive(id: string, active: boolean) {
  await requireNutrition();
  await prisma.food.update({ where: { id }, data: { active } });
  revalidatePath("/dashboard/nutricion/alimentos");
}

/** Row by id (after a barcode scan finds an existing food). */
export async function getFood(id: string): Promise<FoodRow | null> {
  await requireNutrition();
  const f = await prisma.food.findUnique({ where: { id }, select: FOOD_SELECT });
  return f ? toRow(f) : null;
}

/**
 * Merges a duplicate (typically a socio's scan of something already in the
 * base) into `targetId`: diary entries and recipe ingredients now point to the
 * target, the barcode moves over if the target has none, and the duplicate is
 * archived. Snapshots in diaries/plans keep their nutrients as logged.
 */
export async function mergeFoods(sourceId: string, targetId: string) {
  const user = await requireNutrition();
  if (sourceId === targetId) throw new Error("Elige otro alimento.");
  const [source, target] = await Promise.all([
    prisma.food.findUniqueOrThrow({ where: { id: sourceId }, select: { barcode: true } }),
    prisma.food.findUniqueOrThrow({ where: { id: targetId }, select: { barcode: true, verifiedAt: true } }),
  ]);
  await prisma.$transaction([
    prisma.foodLogEntry.updateMany({ where: { foodId: sourceId }, data: { foodId: targetId } }),
    prisma.recipeIngredient.updateMany({ where: { foodId: sourceId }, data: { foodId: targetId } }),
    prisma.food.update({ where: { id: sourceId }, data: { active: false, barcode: null } }),
    ...(source.barcode && !target.barcode
      ? [prisma.food.update({ where: { id: targetId }, data: { barcode: source.barcode } })]
      : []),
    ...(!target.verifiedAt ? [prisma.food.update({ where: { id: targetId }, data: { verifiedAt: new Date(), verifiedById: user.id } })] : []),
  ]);
  revalidatePath("/dashboard/nutricion/alimentos");
}
