"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { pushToMember } from "@/lib/push/send";
import { recipePerServing } from "@/lib/nutrition/nutrients";
import { isMealKey } from "@/lib/nutrition/meals";
import type { Prisma, RecipeStatus, User } from "@/generated/prisma/client";

async function requireNutrition(): Promise<User> {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Sin permisos");
  return user;
}

function revalidateRecipes(id?: string) {
  revalidatePath("/dashboard/nutricion/recetas");
  if (id) revalidatePath(`/dashboard/nutricion/recetas/${id}`);
  revalidatePath("/portal/nutricion");
}

// ── Reads ────────────────────────────────────────────────────────────

export type RecipeListFilter = "por-revisar" | "publicadas" | "borradores" | "rechazadas" | "todas";

const FILTER_STATUS: Record<RecipeListFilter, RecipeStatus[] | null> = {
  "por-revisar": ["SUBMITTED"],
  publicadas: ["PUBLISHED"],
  borradores: ["PRIVATE"],
  rechazadas: ["REJECTED"],
  todas: null,
};

export async function listRecipes(filter: RecipeListFilter = "publicadas", q?: string) {
  await requireNutrition();
  const statuses = FILTER_STATUS[filter];
  const where: Prisma.RecipeWhereInput = {
    active: true,
    ...(statuses ? { status: { in: statuses } } : {}),
    // A socio's PRIVATE recipe is theirs alone; staff drafts have no member author.
    ...(filter === "borradores" ? { authorMemberId: null } : {}),
    ...(q?.trim() ? { title: { contains: q.trim(), mode: "insensitive" as const } } : {}),
  };
  const [rows, counts] = await Promise.all([
    prisma.recipe.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        servings: true,
        kcal: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
        mealKeys: true,
        tags: true,
        photoUrl: true,
        updatedAt: true,
        authorMember: { select: { firstName: true, lastName: true } },
        _count: { select: { ingredients: true } },
      },
    }),
    prisma.recipe.groupBy({
      by: ["status"],
      where: { active: true, OR: [{ status: { not: "PRIVATE" } }, { authorMemberId: null }] },
      _count: { _all: true },
    }),
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<RecipeStatus, number>>;
  return { rows, countBy };
}

export async function getRecipeForEdit(id: string) {
  await requireNutrition();
  return prisma.recipe.findUnique({
    where: { id },
    include: {
      authorMember: { select: { id: true, firstName: true, lastName: true } },
      ingredients: {
        orderBy: { sortOrder: "asc" },
        include: {
          food: {
            select: { id: true, name: true, brand: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true, portions: true },
          },
        },
      },
    },
  });
}

// ── Save ─────────────────────────────────────────────────────────────

export type RecipeInput = {
  title: string;
  description?: string | null;
  instructions: string;
  servings: number;
  prepMinutes?: number | null;
  tags?: string[];
  mealKeys?: string[];
  macrosFromIngredients: boolean;
  // Used only when macrosFromIngredients = false (typed from a label/table).
  manual?: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG?: number | null };
  ingredients: { foodId?: string | null; label: string; grams?: number | null }[];
};

async function normalizeRecipe(input: RecipeInput) {
  const title = input.title?.trim();
  if (!title) throw new Error("El título es obligatorio.");
  const servings = Math.round(Number(input.servings));
  if (!(servings >= 1 && servings <= 50)) throw new Error("Las porciones deben estar entre 1 y 50.");
  const ingredients = input.ingredients
    .map((i, idx) => ({
      foodId: i.foodId || null,
      label: i.label.trim(),
      grams: i.grams && i.grams > 0 ? Math.round(i.grams * 10) / 10 : null,
      sortOrder: idx,
    }))
    .filter((i) => i.label || i.foodId);

  let macros: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null };
  if (input.macrosFromIngredients) {
    const foodIds = ingredients.map((i) => i.foodId).filter((x): x is string => Boolean(x));
    const foods = await prisma.food.findMany({
      where: { id: { in: foodIds } },
      select: { id: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
    });
    const byId = new Map(foods.map((f) => [f.id, f]));
    const r = recipePerServing(
      ingredients.map((i) => ({ grams: i.grams, food: i.foodId ? byId.get(i.foodId) ?? null : null })),
      servings,
    );
    macros = r.perServing;
  } else {
    const m = input.manual;
    if (!m || !(m.kcal >= 0)) throw new Error("Ingresa las calorías y macros por porción.");
    macros = {
      kcal: Math.round(m.kcal),
      proteinG: m.proteinG || 0,
      carbsG: m.carbsG || 0,
      fatG: m.fatG || 0,
      fiberG: m.fiberG ?? null,
    };
  }

  return {
    data: {
      title,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() ?? "",
      servings,
      prepMinutes: input.prepMinutes && input.prepMinutes > 0 ? Math.round(input.prepMinutes) : null,
      tags: (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      mealKeys: (input.mealKeys ?? []).filter(isMealKey),
      macrosFromIngredients: input.macrosFromIngredients,
      ...macros,
    },
    ingredients,
  };
}

/** Create (id = null) or update a recipe from the staff editor. New staff recipes start as drafts. */
export async function saveRecipe(id: string | null, input: RecipeInput) {
  const user = await requireNutrition();
  const { data, ingredients } = await normalizeRecipe(input);

  const saved = id
    ? await prisma.$transaction(async (tx) => {
        await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
        return tx.recipe.update({
          where: { id },
          data: { ...data, ingredients: { create: ingredients } },
          select: { id: true },
        });
      })
    : await prisma.recipe.create({
        data: { ...data, status: "PRIVATE", authorUserId: user.id, ingredients: { create: ingredients } },
        select: { id: true },
      });

  revalidateRecipes(saved.id);
  return { id: saved.id };
}

const STATUS_PUSH: Partial<Record<RecipeStatus, (title: string) => { title: string; body: string }>> = {
  PUBLISHED: (t) => ({ title: "¡Tu receta fue aprobada!", body: `"${t}" ya está en el recetario de La Cueva.` }),
  PRIVATE: (t) => ({ title: "Tu receta tiene comentarios", body: `La nutricionista revisó "${t}". Mira sus sugerencias.` }),
  REJECTED: (t) => ({ title: "Revisamos tu receta", body: `"${t}" no entra al recetario por ahora. Mira el comentario.` }),
};

/**
 * Review decision: publish to the shared library, send back to its author with
 * a note (PRIVATE), or reject. The socio who wrote it gets a push.
 */
export async function setRecipeStatus(id: string, status: RecipeStatus, reviewNote?: string | null) {
  const user = await requireNutrition();
  const recipe = await prisma.recipe.update({
    where: { id },
    data: {
      status,
      reviewNote: reviewNote === undefined ? undefined : reviewNote?.trim() || null,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
    select: { title: true, authorMemberId: true },
  });
  const push = STATUS_PUSH[status];
  if (recipe.authorMemberId && push) {
    await pushToMember(recipe.authorMemberId, { ...push(recipe.title), url: "/portal/nutricion" }).catch(() => undefined);
  }
  revalidateRecipes(id);
}

export async function setRecipeActive(id: string, active: boolean) {
  await requireNutrition();
  await prisma.recipe.update({ where: { id }, data: { active } });
  revalidateRecipes(id);
}
