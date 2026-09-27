/**
 * Siembra la base de nutrición SRXFIT (sep 2026) — ver prisma/seed-data/nutricion-base/:
 *   - recetas.json     → 14 recetas del canal de YouTube de La Cueva + 20 batidos verdes
 *                        (guía del Reto 60X), PUBLICADAS, macros calculadas con la base de alimentos.
 *   - videos-blog.json → enlaza su video a las recetas del blog 2023 que siguen en revisión.
 *   - plantillas.json  → 7 plantillas "Estándar SRXFIT" 1200–2400 kcal (hojas por calorías de
 *                        La Cueva, recalculadas), intercambios formato Xtreme y "Semana tipo".
 *   - capsulas.json    → 10 cápsulas (NutritionTip) con la filosofía de nutrición SRXFIT.
 *
 * Los alimentos nuevos que usan (yogur light, albacora…) están en foods-ec.csv: correr antes
 * `npm run db:seed:nutricion -- --write`.
 *
 * Idempotente y no destructivo: crea lo que falta (recetas por título, plantillas por nombre,
 * cápsulas por título) y nunca pisa lo que la nutricionista ya editó o revisó. Dry run por defecto.
 *
 * Uso:  npx tsx scripts/seed-nutricion-base.ts [--write]
 */
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeSearch, recipePerServing } from "../src/lib/nutrition/nutrients";
import { planContentSchema } from "../src/lib/nutrition/plan-schema";
import { youtubeId } from "../src/lib/nutrition/video";

const WRITE = process.argv.includes("--write");
const DIR = resolve(process.cwd(), "prisma/seed-data/nutricion-base");
const load = <T>(f: string): T => JSON.parse(readFileSync(resolve(DIR, f), "utf8"));

type SeedRecipe = {
  title: string;
  description: string;
  servings: number;
  prepMinutes: number | null;
  mealKeys: string[];
  tags: string[];
  sourceUrl: string | null;
  instructions: string;
  reviewNote: string;
  ingredients: { label: string; foodName: string | null; grams: number | null }[];
};
type SeedItem = { food?: string; recipe?: string; grams?: number; servings?: number; name: string; portionLabel?: string | null };
type SeedTemplate = { name: string; calorieLevel: number; notes: string; content: Record<string, unknown> & { days: { meals: { options: { items: SeedItem[] }[] }[] }[] } };
type SeedTip = { title: string; body: string };

const r1 = (n: number) => Math.round(n * 10) / 10;

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const recipes = load<SeedRecipe[]>("recetas.json");
  const templates = load<SeedTemplate[]>("plantillas.json");
  const tips = load<SeedTip[]>("capsulas.json");
  const blogVideos = load<Record<string, string>>("videos-blog.json");

  // Curated foods by normalized name — the seed files reference foods by their CSV name.
  const foods = await prisma.food.findMany({
    where: { source: "CURATED", active: true },
    select: { id: true, name: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
  });
  const foodBy = new Map(foods.map((f) => [normalizeSearch(f.name), f]));
  const food = (name: string) => {
    const f = foodBy.get(normalizeSearch(name));
    if (!f) throw new Error(`Falta el alimento "${name}" — corre primero: npm run db:seed:nutricion -- --write`);
    return f;
  };

  // ── Recetas ──
  const existing = await prisma.recipe.findMany({ select: { id: true, title: true } });
  const recipeTitles = new Set(existing.map((r) => normalizeSearch(r.title)));
  const newRecipes = recipes.filter((r) => !recipeTitles.has(normalizeSearch(r.title)));

  const blogToLink = await prisma.recipe.findMany({
    where: { title: { in: Object.keys(blogVideos) }, reviewedAt: null },
    select: { id: true, title: true, sourceUrl: true },
  });
  const linkable = blogToLink.filter((r) => !youtubeId(r.sourceUrl));

  // ── Plantillas y cápsulas ──
  const existingTemplates = new Set((await prisma.mealPlanTemplate.findMany({ select: { name: true } })).map((t) => t.name));
  const newTemplates = templates.filter((t) => !existingTemplates.has(t.name));
  const existingTips = new Set((await prisma.nutritionTip.findMany({ select: { title: true } })).map((t) => t.title));
  const newTips = tips.filter((t) => !existingTips.has(t.title));

  // Validate everything before writing anything (recipes may be the ones created below).
  for (const r of newRecipes) for (const i of r.ingredients) if (i.foodName) food(i.foodName);
  const seededTitles = new Set([...recipeTitles, ...newRecipes.map((r) => normalizeSearch(r.title))]);
  for (const t of newTemplates)
    for (const d of t.content.days)
      for (const m of d.meals)
        for (const o of m.options)
          for (const it of o.items) {
            if (it.food) food(it.food);
            else if (!it.recipe || !seededTitles.has(normalizeSearch(it.recipe))) throw new Error(`Plantilla "${t.name}": ítem sin alimento/receta válida (${it.name})`);
          }

  console.log(`Recetas: ${recipes.length} en el JSON, ${newRecipes.length} nuevas.`);
  console.log(`Videos para recetas del blog en revisión: ${linkable.length} de ${Object.keys(blogVideos).length - 1}.`);
  console.log(`Plantillas: ${templates.length} en el JSON, ${newTemplates.length} nuevas.`);
  console.log(`Cápsulas: ${tips.length} en el JSON, ${newTips.length} nuevas.`);

  if (!WRITE) {
    console.log("\nDRY RUN — nada escrito. Correr con --write para sembrar.");
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  for (const r of newRecipes) {
    const ingredients = r.ingredients.map((i, k) => {
      const f = i.foodName ? food(i.foodName) : null;
      return { foodId: f?.id ?? null, label: i.label, grams: i.grams, sortOrder: k, food: f };
    });
    const { perServing } = recipePerServing(ingredients, r.servings);
    await prisma.recipe.create({
      data: {
        title: r.title,
        description: r.description,
        instructions: r.instructions,
        servings: r.servings,
        prepMinutes: r.prepMinutes,
        tags: r.tags,
        mealKeys: r.mealKeys,
        status: "PUBLISHED",
        reviewNote: r.reviewNote,
        reviewedAt: now,
        sourceUrl: r.sourceUrl,
        macrosFromIngredients: true,
        ...perServing,
        ingredients: { create: ingredients.map((i) => ({ foodId: i.foodId, label: i.label, grams: i.grams, sortOrder: i.sortOrder })) },
      },
    });
  }

  for (const r of linkable) {
    await prisma.recipe.update({ where: { id: r.id }, data: { sourceUrl: blogVideos[r.title] } });
  }

  // Template items name foods/recipes; resolve ids and snapshot nutrients from the DB.
  const recipeRows = await prisma.recipe.findMany({
    where: { active: true },
    select: { id: true, title: true, kcal: true, proteinG: true, carbsG: true, fatG: true },
  });
  const recipeBy = new Map(recipeRows.map((r) => [normalizeSearch(r.title), r]));
  const resolveItem = (it: SeedItem) => {
    if (it.recipe) {
      const r = recipeBy.get(normalizeSearch(it.recipe));
      if (!r) throw new Error(`Plantilla: falta la receta "${it.recipe}"`);
      const s = it.servings ?? 1;
      return {
        foodId: null,
        recipeId: r.id,
        name: it.name,
        grams: null,
        servings: s,
        portionLabel: it.portionLabel ?? null,
        kcal: Math.round(r.kcal * s),
        proteinG: r1(r.proteinG * s),
        carbsG: r1(r.carbsG * s),
        fatG: r1(r.fatG * s),
      };
    }
    const f = food(it.food!);
    const g = it.grams!;
    return {
      foodId: f.id,
      recipeId: null,
      name: it.name,
      grams: g,
      servings: null,
      portionLabel: it.portionLabel ?? null,
      kcal: Math.round((f.kcal * g) / 100),
      proteinG: r1((f.proteinG * g) / 100),
      carbsG: r1((f.carbsG * g) / 100),
      fatG: r1((f.fatG * g) / 100),
    };
  };

  for (const t of newTemplates) {
    const content = planContentSchema.parse({
      ...t.content,
      days: t.content.days.map((d) => ({
        ...d,
        meals: d.meals.map((m) => ({ ...m, options: m.options.map((o) => ({ ...o, items: o.items.map(resolveItem) })) })),
      })),
    });
    await prisma.mealPlanTemplate.create({
      data: {
        name: t.name,
        calorieLevel: t.calorieLevel,
        notes: t.notes,
        content: content as unknown as Prisma.InputJsonValue,
        schemaVersion: 2,
      },
    });
  }

  // The portal lists tips newest first: create the first one last.
  for (const [i, t] of [...newTips].reverse().entries()) {
    await prisma.nutritionTip.create({ data: { title: t.title, body: t.body, createdAt: new Date(now.getTime() + i * 1000) } });
  }

  console.log("\n✅ Sembrado.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
