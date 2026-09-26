"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { ecuadorDateString, todayDateUtc } from "@/lib/timezone";
import { foodSearchWhere, foodVisibleToMember } from "@/lib/nutrition/food-input";
import { parsePortions, scaleFood, type Portion } from "@/lib/nutrition/nutrients";
import { isMealKey, normalizeMealSplit } from "@/lib/nutrition/meals";
import { equivalentSwaps, type Swap } from "@/lib/nutrition/swap";
import { EXCHANGE_LABEL } from "@/lib/nutrition/exchanges";
import { isoWeekday } from "@/lib/nutrition/adherence";
import { menuDayFor, parsePlanContent } from "@/lib/nutrition/plan-schema";
import type { FoodLogSource, Prisma } from "@/generated/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKFILL_DAYS = 7;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** "YYYY-MM-DD" → UTC-midnight Date, limited to the last week (MFP-style backfill), never the future. */
function diaryDate(date?: string | null): Date {
  const today = todayDateUtc();
  if (!date) return today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida.");
  const d = new Date(`${date}T00:00:00.000Z`);
  if (d.getTime() > today.getTime()) throw new Error("No puedes registrar días futuros.");
  if (today.getTime() - d.getTime() > BACKFILL_DAYS * DAY_MS) throw new Error("Solo puedes registrar la última semana.");
  return d;
}

function revalidateDiary() {
  revalidatePath("/portal/nutricion");
}

// ── Search ───────────────────────────────────────────────────────────

export type DiaryFood = {
  kind: "food";
  id: string;
  name: string;
  brand: string | null;
  kcal: number; // per 100
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  isLiquid: boolean;
  portions: Portion[];
  verified: boolean;
  mine: boolean;
  lastGrams?: number | null;
};

export type DiaryRecipe = {
  kind: "recipe";
  id: string;
  name: string;
  kcal: number; // per serving
  proteinG: number;
  carbsG: number;
  fatG: number;
  mine: boolean;
  lastServings?: number | null;
};

export type DiaryHit = DiaryFood | DiaryRecipe;

const FOOD_SELECT = {
  id: true,
  name: true,
  brand: true,
  kcal: true,
  proteinG: true,
  carbsG: true,
  fatG: true,
  fiberG: true,
  isLiquid: true,
  portions: true,
  verifiedAt: true,
  createdByMemberId: true,
} satisfies Prisma.FoodSelect;

function toFood(f: Prisma.FoodGetPayload<{ select: typeof FOOD_SELECT }>, memberId: string): DiaryFood {
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

const RECIPE_SELECT = { id: true, title: true, kcal: true, proteinG: true, carbsG: true, fatG: true, authorMemberId: true } satisfies Prisma.RecipeSelect;

function toRecipe(r: Prisma.RecipeGetPayload<{ select: typeof RECIPE_SELECT }>, memberId: string): DiaryRecipe {
  return { kind: "recipe", id: r.id, name: r.title, kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, mine: r.authorMemberId === memberId };
}

/** Foods the socio may see (verified + their own) and recipes (published + their own). */
export async function searchDiaryItems(q: string): Promise<DiaryHit[]> {
  const { member } = await requireMember();
  const where = foodSearchWhere(q);
  if (where.length === 0) return [];
  const [foods, recipes] = await Promise.all([
    prisma.food.findMany({ where: { ...foodVisibleToMember(member.id), AND: where }, select: FOOD_SELECT, take: 60 }),
    prisma.recipe.findMany({
      where: {
        active: true,
        title: { contains: q.trim(), mode: "insensitive" },
        OR: [{ status: "PUBLISHED" }, { authorMemberId: member.id }],
      },
      select: RECIPE_SELECT,
      take: 8,
    }),
  ]);
  const f = foods
    .map((x) => toFood(x, member.id))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.length - b.name.length || a.name.localeCompare(b.name, "es"))
    .slice(0, 25);
  return [...recipes.map((r) => toRecipe(r, member.id)), ...f];
}

/** Recientes / Frecuentes / Mis alimentos — the MFP shortcut lists. */
export async function getDiaryShortcuts(): Promise<{ recent: DiaryHit[]; frequent: DiaryHit[]; mine: DiaryHit[] }> {
  const { member } = await requireMember();
  const since = new Date(Date.now() - 60 * DAY_MS);
  const [last, freq, mineFoods, mineRecipes] = await Promise.all([
    prisma.foodLogEntry.findMany({
      where: { memberId: member.id, active: true, OR: [{ foodId: { not: null } }, { recipeId: { not: null } }] },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: { foodId: true, recipeId: true, grams: true, servings: true },
    }),
    prisma.foodLogEntry.groupBy({
      by: ["foodId"],
      where: { memberId: member.id, active: true, foodId: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { foodId: "desc" } },
      take: 15,
    }),
    prisma.food.findMany({ where: { active: true, createdByMemberId: member.id }, select: FOOD_SELECT, orderBy: { name: "asc" }, take: 50 }),
    prisma.recipe.findMany({ where: { active: true, authorMemberId: member.id }, select: RECIPE_SELECT, orderBy: { title: "asc" }, take: 30 }),
  ]);

  const recentKeys: { foodId: string | null; recipeId: string | null; grams: number | null; servings: number | null }[] = [];
  const seen = new Set<string>();
  for (const e of last) {
    const k = e.foodId ? `f${e.foodId}` : `r${e.recipeId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    recentKeys.push(e);
    if (recentKeys.length >= 15) break;
  }
  const foodIds = [...new Set([...recentKeys.map((k) => k.foodId), ...freq.map((f) => f.foodId)].filter((x): x is string => Boolean(x)))];
  const recipeIds = recentKeys.map((k) => k.recipeId).filter((x): x is string => Boolean(x));
  const [foods, recipes] = await Promise.all([
    prisma.food.findMany({ where: { id: { in: foodIds }, active: true }, select: FOOD_SELECT }),
    prisma.recipe.findMany({ where: { id: { in: recipeIds }, active: true }, select: RECIPE_SELECT }),
  ]);
  const foodBy = new Map(foods.map((f) => [f.id, toFood(f, member.id)]));
  const recipeBy = new Map(recipes.map((r) => [r.id, toRecipe(r, member.id)]));

  const recent: DiaryHit[] = recentKeys
    .map((k): DiaryHit | null => {
      if (k.foodId) {
        const f = foodBy.get(k.foodId);
        return f ? { ...f, lastGrams: k.grams } : null;
      }
      const r = recipeBy.get(k.recipeId!);
      return r ? { ...r, lastServings: k.servings } : null;
    })
    .filter((x): x is DiaryHit => x !== null);
  const frequent = freq.map((f) => foodBy.get(f.foodId!)).filter((x): x is DiaryFood => Boolean(x));

  return {
    recent,
    frequent,
    mine: [...mineRecipes.map((r) => toRecipe(r, member.id)), ...mineFoods.map((f) => toFood(f, member.id))],
  };
}

// ── Write ────────────────────────────────────────────────────────────

export type AddEntryInput = {
  date?: string | null;
  mealKey: string;
  foodId?: string | null;
  recipeId?: string | null;
  grams?: number | null;
  servings?: number | null;
  portionLabel?: string | null;
  quick?: { name?: string | null; kcal: number; proteinG?: number | null; carbsG?: number | null; fatG?: number | null } | null;
  source?: FoodLogSource;
};

/** Nutrients are computed here from the DB, never taken from the client (except quick-add). */
async function resolveEntry(memberId: string, input: AddEntryInput) {
  if (input.foodId) {
    const f = await prisma.food.findFirst({ where: { id: input.foodId, ...foodVisibleToMember(memberId) } });
    if (!f) throw new Error("Alimento no disponible.");
    const grams = Number(input.grams);
    if (!(grams > 0 && grams <= 5000)) throw new Error("Cantidad inválida.");
    const m = scaleFood(f, grams);
    return {
      foodId: f.id,
      recipeId: null,
      name: f.brand ? `${f.name} (${f.brand})` : f.name,
      grams: r1(grams),
      servings: null,
      portionLabel: input.portionLabel?.trim() || null,
      ...m,
    };
  }
  if (input.recipeId) {
    const r = await prisma.recipe.findFirst({
      where: { id: input.recipeId, active: true, OR: [{ status: "PUBLISHED" }, { authorMemberId: memberId }] },
    });
    if (!r) throw new Error("Receta no disponible.");
    const s = Number(input.servings ?? 1);
    if (!(s > 0 && s <= 20)) throw new Error("Porciones inválidas.");
    return {
      foodId: null,
      recipeId: r.id,
      name: r.title,
      grams: null,
      servings: r1(s),
      portionLabel: null,
      kcal: Math.round(r.kcal * s),
      proteinG: r1(r.proteinG * s),
      carbsG: r1(r.carbsG * s),
      fatG: r1(r.fatG * s),
      fiberG: r.fiberG ? r1(r.fiberG * s) : null,
    };
  }
  if (input.quick) {
    const kcal = Math.round(Number(input.quick.kcal));
    if (!(kcal > 0 && kcal <= 5000)) throw new Error("Calorías inválidas.");
    return {
      foodId: null,
      recipeId: null,
      name: input.quick.name?.trim() || "Calorías rápidas",
      grams: null,
      servings: null,
      portionLabel: null,
      kcal,
      proteinG: r1(Number(input.quick.proteinG) || 0),
      carbsG: r1(Number(input.quick.carbsG) || 0),
      fatG: r1(Number(input.quick.fatG) || 0),
      fiberG: null,
    };
  }
  throw new Error("Elige un alimento.");
}

export async function addFoodLogEntry(input: AddEntryInput) {
  const { member } = await requireMember();
  if (!isMealKey(input.mealKey)) throw new Error("Comida inválida.");
  const date = diaryDate(input.date);
  const data = await resolveEntry(member.id, input);
  const source: FoodLogSource = input.source ?? (input.quick ? "QUICK_ADD" : input.recipeId ? "RECIPE" : "SEARCH");
  const e = await prisma.foodLogEntry.create({
    data: { memberId: member.id, date, mealKey: input.mealKey, source, ...data },
    select: { id: true },
  });
  revalidateDiary();
  return e;
}

export async function updateFoodLogEntry(id: string, input: { grams?: number | null; servings?: number | null; mealKey?: string | null; portionLabel?: string | null }) {
  const { member } = await requireMember();
  const e = await prisma.foodLogEntry.findFirst({ where: { id, memberId: member.id, active: true } });
  if (!e) throw new Error("Registro no encontrado.");
  diaryDate(e.date.toISOString().slice(0, 10)); // can't edit old weeks either
  let patch: Partial<Prisma.FoodLogEntryUncheckedUpdateInput> = {};
  if (input.mealKey) {
    if (!isMealKey(input.mealKey)) throw new Error("Comida inválida.");
    patch.mealKey = input.mealKey;
  }
  const amount = e.recipeId ? input.servings : input.grams;
  if (amount && amount > 0) {
    if (e.foodId || e.recipeId) {
      const fresh = await resolveEntry(member.id, {
        mealKey: e.mealKey,
        foodId: e.foodId,
        recipeId: e.recipeId,
        grams: input.grams,
        servings: input.servings,
        portionLabel: input.portionLabel,
      });
      patch = { ...patch, ...fresh };
    } else {
      // Food/recipe gone or quick add: scale the snapshot.
      const prev = (e.recipeId ? e.servings : e.grams) ?? 0;
      if (prev > 0) {
        const f = amount / prev;
        patch = { ...patch, kcal: Math.round(e.kcal * f), proteinG: r1(e.proteinG * f), carbsG: r1(e.carbsG * f), fatG: r1(e.fatG * f) };
      }
    }
  }
  await prisma.foodLogEntry.update({ where: { id }, data: patch });
  revalidateDiary();
}

export async function removeFoodLogEntry(id: string) {
  const { member } = await requireMember();
  const r = await prisma.foodLogEntry.updateMany({ where: { id, memberId: member.id, active: true }, data: { active: false } });
  if (r.count === 0) throw new Error("Registro no encontrado.");
  revalidateDiary();
}

/** "Copiar de ayer": duplicates one meal of a day into a meal of another day. */
export async function copyMeal(input: { fromDate: string; fromMeal: string; toDate: string; toMeal: string }) {
  const { member } = await requireMember();
  if (!isMealKey(input.fromMeal) || !isMealKey(input.toMeal)) throw new Error("Comida inválida.");
  const from = new Date(`${input.fromDate}T00:00:00.000Z`);
  const to = diaryDate(input.toDate);
  const src = await prisma.foodLogEntry.findMany({ where: { memberId: member.id, date: from, mealKey: input.fromMeal, active: true } });
  if (src.length === 0) throw new Error("Esa comida está vacía.");
  await prisma.foodLogEntry.createMany({
    data: src.map((e) => ({
      memberId: member.id,
      date: to,
      mealKey: input.toMeal,
      foodId: e.foodId,
      recipeId: e.recipeId,
      name: e.name,
      grams: e.grams,
      servings: e.servings,
      portionLabel: e.portionLabel,
      kcal: e.kcal,
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
      fiberG: e.fiberG,
      source: "COPY" as const,
    })),
  });
  revalidateDiary();
  return { copied: src.length };
}

/**
 * "Lo cumplí → al diario": adds the items of today's plan option for a meal.
 * Only MENU plans have concrete foods (exchanges don't).
 */
export async function addPlanOptionToDiary(input: { mealKey: string; optionId: string }) {
  const { member } = await requireMember();
  if (!isMealKey(input.mealKey)) throw new Error("Comida inválida.");
  const plan = await prisma.mealPlan.findFirst({
    where: { memberId: member.id, active: true, visibleToMember: true, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { content: true },
  });
  const content = parsePlanContent(plan?.content);
  if (!content || content.kind !== "MENU") throw new Error("Tu plan no tiene alimentos concretos para esta comida.");
  const day = menuDayFor(content, isoWeekday(ecuadorDateString()));
  const option = day?.meals.find((m) => m.key === input.mealKey)?.options.find((o) => o.id === input.optionId);
  if (!option || option.items.length === 0) throw new Error("Opción no encontrada.");
  const date = todayDateUtc();
  // Idempotent: don't add the same plan option twice to the same meal.
  const existing = await prisma.foodLogEntry.count({
    where: { memberId: member.id, date, mealKey: input.mealKey, source: "PLAN", active: true },
  });
  if (existing > 0) return { added: 0 };
  await prisma.foodLogEntry.createMany({
    data: option.items.map((i) => ({
      memberId: member.id,
      date,
      mealKey: input.mealKey,
      foodId: i.foodId ?? null,
      recipeId: i.recipeId ?? null,
      name: i.name,
      grams: i.grams ?? null,
      servings: i.servings ?? null,
      portionLabel: i.portionLabel ?? null,
      kcal: i.kcal,
      proteinG: i.proteinG,
      carbsG: i.carbsG,
      fatG: i.fatG,
      source: "PLAN" as const,
    })),
  });
  revalidateDiary();
  return { added: option.items.length };
}

/** "Cambiar por…": same exchange-group foods in the amount that matches this entry's kcal. */
export async function getSwapsForEntry(id: string): Promise<{ swaps: Swap[]; groupLabel: string | null }> {
  const { member } = await requireMember();
  const e = await prisma.foodLogEntry.findFirst({
    where: { id, memberId: member.id },
    select: { kcal: true, grams: true, food: { select: { id: true, exchangeGroup: true } } },
  });
  const group = e?.food?.exchangeGroup;
  if (!e || !group || group === "FREE") return { swaps: [], groupLabel: null };
  const candidates = await prisma.food.findMany({
    where: { active: true, verifiedAt: { not: null }, exchangeGroup: group },
    select: { id: true, name: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true, isLiquid: true },
    take: 80,
  });
  return { swaps: equivalentSwaps(e.kcal, e.grams, candidates, e.food!.id), groupLabel: EXCHANGE_LABEL[group] };
}

/** Replace an entry with a swap (same meal, same day). */
export async function swapFoodLogEntry(id: string, foodId: string, grams: number) {
  const { member } = await requireMember();
  const e = await prisma.foodLogEntry.findFirst({ where: { id, memberId: member.id, active: true } });
  if (!e) throw new Error("Registro no encontrado.");
  const data = await resolveEntry(member.id, { mealKey: e.mealKey, foodId, grams });
  await prisma.$transaction([
    prisma.foodLogEntry.update({ where: { id }, data: { active: false } }),
    prisma.foodLogEntry.create({ data: { memberId: member.id, date: e.date, mealKey: e.mealKey, source: "SEARCH", ...data } }),
  ]);
  revalidateDiary();
}

/** Socio sets their own target with the calculator — unless the nutritionist set one. */
export async function saveMyNutritionTarget(input: {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  inputs?: Record<string, unknown>;
}) {
  const { member } = await requireMember();
  const existing = await prisma.nutritionTarget.findUnique({ where: { memberId: member.id }, select: { source: true, mealSplit: true } });
  if (existing?.source === "NUTRITIONIST") throw new Error("Tu meta la definió tu nutricionista. Escríbele si quieres cambiarla.");
  const kcal = Math.round(input.kcal);
  if (!(kcal >= 1000 && kcal <= 5000)) throw new Error("La meta debe estar entre 1000 y 5000 kcal.");
  const data = {
    kcal,
    proteinG: Math.round(input.proteinG),
    carbsG: Math.round(input.carbsG),
    fatG: Math.round(input.fatG),
    mealSplit: normalizeMealSplit(existing?.mealSplit as Record<string, number> | undefined),
    inputs: (input.inputs ?? undefined) as object | undefined,
    source: "MEMBER" as const,
  };
  await prisma.nutritionTarget.upsert({ where: { memberId: member.id }, create: { memberId: member.id, ...data }, update: data });
  revalidateDiary();
}
