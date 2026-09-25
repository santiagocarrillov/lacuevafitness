/**
 * Seeds the nutrition library:
 *   - prisma/seed-data/foods-ec.csv     → Food (source CURATED, verified)
 *   - prisma/seed-data/recipes-blog.json → Recipe (the old blog recipes, status
 *     SUBMITTED so they land in the nutritionist's "por revisar" queue before
 *     socios see them — their nutrition tables need a professional look)
 *
 * Idempotent and non-destructive: only creates what is missing (foods by
 * normalized name, recipes by title). Never overwrites the nutritionist's edits.
 * Dry run by default.
 *
 * Uso:  npx tsx scripts/seed-nutrition.ts [--write]
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseFoodsCsv } from "../src/lib/nutrition/foods-csv";
import { normalizeSearch } from "../src/lib/nutrition/nutrients";
import type { ParsedBlogRecipe } from "../src/lib/nutrition/blog-recipe-parser";

const WRITE = process.argv.includes("--write");

type SeedRecipe = ParsedBlogRecipe & { mealKeys: string[]; tags: string[] };

async function main() {
  const foods = parseFoodsCsv(readFileSync(resolve(process.cwd(), "prisma/seed-data/foods-ec.csv"), "utf8"));
  const recipes: SeedRecipe[] = JSON.parse(
    readFileSync(resolve(process.cwd(), "prisma/seed-data/recipes-blog.json"), "utf8"),
  );

  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const existingFoods = new Set(
    (await prisma.food.findMany({ where: { source: "CURATED" }, select: { searchName: true } })).map(
      (f) => f.searchName,
    ),
  );
  const newFoods = foods.filter((f) => !existingFoods.has(normalizeSearch(f.name)));

  const existingRecipes = new Set(
    (await prisma.recipe.findMany({ select: { title: true } })).map((r) => normalizeSearch(r.title)),
  );
  const newRecipes = recipes.filter((r) => !existingRecipes.has(normalizeSearch(r.title)));

  console.log(`Alimentos: ${foods.length} en el CSV, ${newFoods.length} nuevos.`);
  console.log(`Recetas: ${recipes.length} en el JSON, ${newRecipes.length} nuevas.`);

  if (!WRITE) {
    console.log("\nDRY RUN — nada escrito. Correr con --write para sembrar.");
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  if (newFoods.length) {
    await prisma.food.createMany({
      data: newFoods.map((f) => ({
        name: f.name,
        searchName: normalizeSearch(f.name),
        kcal: f.kcal,
        proteinG: f.proteinG,
        carbsG: f.carbsG,
        fatG: f.fatG,
        fiberG: f.fiberG,
        isLiquid: f.isLiquid,
        portions: f.portions,
        exchangeGroup: f.group,
        exchangeGrams: f.exchangeGrams,
        source: "CURATED" as const,
        sourceNote: f.sourceNote,
        verifiedAt: now,
      })),
    });
  }

  for (const r of newRecipes) {
    await prisma.recipe.create({
      data: {
        title: r.title,
        description: r.description,
        instructions: r.instructions,
        servings: r.servings,
        tags: r.tags,
        mealKeys: r.mealKeys,
        status: "SUBMITTED",
        reviewNote: "Importada del blog de La Cueva (2023). Revisa la tabla nutricional y enlaza los ingredientes antes de publicarla.",
        sourceUrl: r.url,
        macrosFromIngredients: false,
        kcal: r.nutrition!.kcal,
        proteinG: r.nutrition!.proteinG,
        carbsG: r.nutrition!.carbsG,
        fatG: r.nutrition!.fatG,
        fiberG: r.nutrition!.fiberG,
        ingredients: {
          create: r.ingredients.map((ing, i) => ({ label: ing.label, grams: ing.grams, sortOrder: i })),
        },
      },
    });
  }

  console.log("\n✅ Sembrado.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
