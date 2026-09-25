/**
 * One-off: parses the recipes rescued from the old blog into
 * prisma/seed-data/recipes-blog.json (committed), which seed-nutrition.ts loads.
 * Only recipes with a nutrition table are kept — without it we'd seed 0 kcal.
 *
 * Uso:  npx tsx scripts/build-blog-recipes-json.ts [carpeta_blog_posts]
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parseBlogRecipe } from "../src/lib/nutrition/blog-recipe-parser";

const dir =
  process.argv[2] ?? join(__dirname, "../../RESCATE_lacuevafitnesscenter/blog_posts");

// Cleaner titles + where each recipe fits in the day.
const OVERRIDES: Record<string, { title?: string; mealKeys: string[]; tags: string[] }> = {
  "Leche de Avena": { mealKeys: ["breakfast", "snack_am"], tags: ["bebida", "vegano"] },
  "Zucchini Frito": { title: "Zucchini crocante", mealKeys: ["snack_pm"], tags: ["aperitivo"] },
  "Cake de Proteína": { title: "Cake de proteína en taza", mealKeys: ["snack_am", "snack_pm"], tags: ["dulce", "alto en proteína"] },
  "Helado de Fresa": { title: "Helado de fresa", mealKeys: ["snack_pm"], tags: ["dulce"] },
  "Wrap de Pollo": { title: "Wrap de pollo", mealKeys: ["lunch", "dinner"], tags: ["alto en proteína"] },
  "Pudín de Chía": { title: "Pudín de chía", mealKeys: ["breakfast", "snack_am"], tags: ["dulce"] },
  "Batido de Proteína": { title: "Batido de proteína con frutas", mealKeys: ["breakfast", "snack_pm"], tags: ["bebida", "alto en proteína"] },
  "Ensalada de Atún": { title: "Ensalada de atún", mealKeys: ["lunch", "dinner"], tags: ["alto en proteína"] },
  "Pasta con Camarones al Pesto": { title: "Pasta con camarones al pesto", mealKeys: ["lunch"], tags: ["alto en proteína"] },
  "Burritos de Espinaca": { title: "Burritos de espinaca", mealKeys: ["lunch", "dinner"], tags: [] },
  Cevichocho: { mealKeys: ["snack_am", "lunch", "dinner"], tags: ["ecuatoriano", "vegetariano"] },
  "Strogonoff de Lomo": { title: "Strogonoff de lomo", mealKeys: ["lunch", "dinner"], tags: ["alto en proteína"] },
  "Mc Flurry": { title: "McFlurry fit", mealKeys: ["snack_pm"], tags: ["dulce", "alto en proteína"] },
  "Pimientos Rellenos Saludables": { title: "Pimientos rellenos", mealKeys: ["lunch", "dinner"], tags: [] },
  "Avena y Fruta": { title: "Avena con fruta", mealKeys: ["breakfast"], tags: [] },
  "Wrap Proteico": { title: "Wrap proteico", mealKeys: ["lunch", "dinner"], tags: ["alto en proteína"] },
  "Dip de Chochos": { title: "Dip de chochos", mealKeys: ["snack_am", "snack_pm"], tags: ["ecuatoriano", "vegetariano"] },
  "Donas de Manzana": { title: "Donas de manzana", mealKeys: ["snack_pm"], tags: ["dulce"] },
  "Pancakes de Avena: Desayuno Delicioso y Nutritivo": { title: "Pancakes de avena", mealKeys: ["breakfast"], tags: [] },
  "Pizza de Brócoli": { title: "Pizza de brócoli", mealKeys: ["dinner"], tags: ["alto en proteína"] },
  "La Cueva: Mousse de fresas": { title: "Mousse de fresas", mealKeys: ["snack_pm"], tags: ["dulce", "alto en proteína"] },
  "4 Formas de Marinar el Pollo": { title: "Pollo marinado (4 formas)", mealKeys: ["lunch", "dinner"], tags: ["alto en proteína"] },
  "Pizza Fit versión": { title: "Pizza fit", mealKeys: ["dinner"], tags: [] },
};

const out = [];
for (const f of readdirSync(dir).sort()) {
  const r = parseBlogRecipe(readFileSync(join(dir, f), "utf8"));
  if (!r || !r.nutrition) continue;
  const o = OVERRIDES[r.title];
  if (!o) {
    console.warn("sin override:", r.title);
    continue;
  }
  out.push({ ...r, title: o.title ?? r.title, mealKeys: o.mealKeys, tags: o.tags });
}
const target = join(__dirname, "../prisma/seed-data/recipes-blog.json");
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`${out.length} recetas → ${target}`);
