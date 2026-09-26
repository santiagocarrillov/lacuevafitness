"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { notifyStaff } from "@/lib/push/notify-staff";
import { foodSearchWhere, foodVisibleToMember } from "@/lib/nutrition/food-input";
import { normalizeRecipeInput, recipeMacros, type RecipeInput } from "@/lib/nutrition/recipe-input";
import { parsePortions, type Portion } from "@/lib/nutrition/nutrients";

function revalidate(id?: string) {
  revalidatePath("/portal/nutricion");
  revalidatePath("/dashboard/nutricion/recetas");
  if (id) revalidatePath(`/dashboard/nutricion/recetas/${id}`);
}

/** Own recipe the socio may still edit (not while it's being reviewed or once published). */
async function ownEditable(memberId: string, id: string) {
  const r = await prisma.recipe.findFirst({ where: { id, authorMemberId: memberId, active: true }, select: { id: true, status: true } });
  if (!r) throw new Error("Receta no encontrada.");
  if (r.status === "SUBMITTED") throw new Error("Tu nutricionista la está revisando. Retira el envío para editarla.");
  if (r.status === "PUBLISHED") throw new Error("Ya está publicada en el recetario.");
  return r;
}

/** Create (id = null) or update the socio's own recipe. It stays PRIVATE until they send it. */
export async function saveMyRecipe(id: string | null, input: RecipeInput) {
  const { member } = await requireMember();
  const { base, ingredients, foodIds } = normalizeRecipeInput({ ...input, macrosFromIngredients: true });
  // Socios can only use foods they can see.
  const foods = await prisma.food.findMany({
    where: { id: { in: foodIds }, ...foodVisibleToMember(member.id) },
    select: { id: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
  });
  const byId = new Map(foods.map((f) => [f.id, f]));
  const clean = ingredients.map((i) => (i.foodId && !byId.has(i.foodId) ? { ...i, foodId: null } : i));
  const macros = recipeMacros({ ...input, macrosFromIngredients: true }, clean, base.servings, byId);
  const data = { ...base, macrosFromIngredients: true, ...macros };

  let recipeId: string;
  if (id) {
    await ownEditable(member.id, id);
    await prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await tx.recipe.update({ where: { id }, data: { ...data, status: "PRIVATE", ingredients: { create: clean } } });
    });
    recipeId = id;
  } else {
    const r = await prisma.recipe.create({
      data: { ...data, status: "PRIVATE", authorMemberId: member.id, ingredients: { create: clean } },
      select: { id: true },
    });
    recipeId = r.id;
  }
  revalidate(recipeId);
  return { id: recipeId };
}

/** Sends the recipe to the nutritionist's review queue. */
export async function submitMyRecipe(id: string) {
  const { member } = await requireMember();
  const r = await ownEditable(member.id, id);
  const recipe = await prisma.recipe.update({
    where: { id: r.id },
    data: { status: "SUBMITTED", reviewNote: null },
    select: { title: true, _count: { select: { ingredients: true } } },
  });
  if (recipe._count.ingredients === 0) {
    await prisma.recipe.update({ where: { id }, data: { status: "PRIVATE" } });
    throw new Error("Agrega los ingredientes antes de enviarla.");
  }
  await notifyStaff({
    roles: ["NUTRITIONIST"],
    sede: member.sede,
    excludeMemberId: member.id,
    payload: {
      title: "Receta nueva por revisar",
      body: `${member.firstName} envió "${recipe.title}".`,
      url: `/dashboard/nutricion/recetas/${id}`,
    },
  }).catch(() => undefined);
  revalidate(id);
}

/** Takes it back out of review so the socio can keep editing. */
export async function withdrawMyRecipe(id: string) {
  const { member } = await requireMember();
  const r = await prisma.recipe.updateMany({
    where: { id, authorMemberId: member.id, status: "SUBMITTED" },
    data: { status: "PRIVATE" },
  });
  if (r.count === 0) throw new Error("No se pudo retirar.");
  revalidate(id);
}

export async function archiveMyRecipe(id: string) {
  const { member } = await requireMember();
  const r = await prisma.recipe.updateMany({
    where: { id, authorMemberId: member.id, status: { not: "PUBLISHED" } },
    data: { active: false },
  });
  if (r.count === 0) throw new Error("No se pudo borrar.");
  revalidate(id);
}

export type IngredientFood = {
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  isLiquid: boolean;
  portions: Portion[];
};

/** Food lookup for the socio's recipe editor (verified + own foods). */
export async function searchFoodsForMyRecipe(q: string): Promise<IngredientFood[]> {
  const { member } = await requireMember();
  const where = foodSearchWhere(q);
  if (where.length === 0) return [];
  const foods = await prisma.food.findMany({
    where: { ...foodVisibleToMember(member.id), AND: where },
    select: { id: true, name: true, brand: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true, isLiquid: true, portions: true },
    take: 40,
  });
  return foods
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, 12)
    .map((f) => ({ ...f, name: f.brand ? `${f.name} (${f.brand})` : f.name, portions: parsePortions(f.portions) }));
}
