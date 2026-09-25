/**
 * Prueba de la base de nutrición (lógica pura): calculadora de calorías,
 * nutrientes de recetas, intercambios, validación de alimentos, el CSV semilla
 * y el parser de recetas del blog. No toca la BD.
 *
 * Uso:  npm run test:nutricion-base
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { calculateTarget, katchMcArdle, mifflinStJeor, ageFrom } from "../src/lib/nutrition/calc";
import { normalizeSearch, recipePerServing, scaleFood, sumMacros } from "../src/lib/nutrition/nutrients";
import { exchangeGramsFor } from "../src/lib/nutrition/exchanges";
import { validateFoodInput } from "../src/lib/nutrition/food-input";
import { normalizeMealSplit } from "../src/lib/nutrition/meals";
import { parseFoodsCsv } from "../src/lib/nutrition/foods-csv";
import { cleanTitle, gramsFromLabel, parseBlogRecipe } from "../src/lib/nutrition/blog-recipe-parser";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${!ok && detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
}
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

// ── Calculadora ────────────────────────────────────────────────────────────
// Mifflin: mujer 30 a, 65 kg, 165 cm → 10*65 + 6.25*165 - 5*30 - 161 = 1370.25
check("Mifflin mujer", near(mifflinStJeor("FEMALE", 65, 165, 30), 1370.25, 0.01));
check("Mifflin hombre", near(mifflinStJeor("MALE", 80, 180, 35), 1755, 0.01));
// Katch: 80 kg, 20% grasa → 370 + 21.6*64 = 1752.4
check("Katch-McArdle", near(katchMcArdle(80, 20), 1752.4, 0.01));
check("edad cumplida", ageFrom(new Date("1990-10-10"), new Date("2026-09-25")) === 35);

const base = { sex: "FEMALE" as const, ageYears: 30, weightKg: 65, heightCm: 165, activity: "moderate" as const, goal: "maintain" as const };
const r1 = calculateTarget(base);
check("mantener = TMB × 1.55 (redondeado a 10)", r1.kcal === Math.round((1370.25 * 1.55) / 10) * 10, r1);
check("usa Mifflin sin % grasa", r1.bmrMethod === "mifflin");
check("macros cuadran con kcal (±15)", near(r1.proteinG * 4 + r1.carbsG * 4 + r1.fatG * 9, r1.kcal, 15), r1);
const r2 = calculateTarget({ ...base, bodyFatPct: 28 });
check("con % grasa usa Katch", r2.bmrMethod === "katch");
const r3 = calculateTarget({ ...base, bodyFatPct: 28, measuredBmr: 1400 });
check("bioimpedancia manda sobre todo", r3.bmrMethod === "measured" && r3.bmr === 1400);
const r4 = calculateTarget({ ...base, weightKg: 45, heightCm: 150, ageYears: 60, activity: "sedentary", goal: "lose_fast" });
check("nunca baja de 1200 en mujeres", r4.kcal >= 1200 && r4.warnings.length > 0, r4);
check("déficit baja la meta", calculateTarget({ ...base, goal: "lose" }).kcal < r1.kcal);

// ── Nutrientes ─────────────────────────────────────────────────────────────
const pollo = { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0 };
const arroz = { kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, fiberG: 0.4 };
check("150 g de pollo", JSON.stringify(scaleFood(pollo, 150)) === JSON.stringify({ kcal: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4, fiberG: 0 }), scaleFood(pollo, 150));
const rec = recipePerServing(
  [
    { grams: 300, food: pollo },
    { grams: 316, food: arroz },
    { grams: null, food: arroz }, // sin gramos: no suma
    { grams: 10, food: null }, // sin enlazar: no suma
  ],
  2,
);
check("receta por porción", rec.perServing.kcal === Math.round((495 + 410.8) / 2) && rec.computed === 2, rec);
check("sumMacros", sumMacros([pollo, arroz]).kcal === 295);
check("normalizeSearch quita tildes", normalizeSearch("  Fréjol NEGRO, cocido ") === "frejol negro cocido");

// ── Intercambios ───────────────────────────────────────────────────────────
check("1 almidón de arroz ≈ 55 g", exchangeGramsFor("STARCH", arroz) === 55, exchangeGramsFor("STARCH", arroz));
check("1 proteína de pollo ≈ 25 g", exchangeGramsFor("PROTEIN", pollo) === 25, exchangeGramsFor("PROTEIN", pollo));
check("vegetal con pocos carbos se topa en 150 g", exchangeGramsFor("VEGETABLE", { proteinG: 1.4, carbsG: 2.9, fatG: 0.2 }) === 150);
check("libre no tiene intercambio", exchangeGramsFor("FREE", pollo) === null);

// ── Validación de alimentos ────────────────────────────────────────────────
const ok = validateFoodInput({ name: " Yogur griego ", brand: "Toni", kcal: 59, proteinG: 10.2, carbsG: 3.6, fatG: 0.4, exchangeGroup: "DAIRY" });
check("valida y normaliza", ok.name === "Yogur griego" && ok.searchName === "yogur griego toni" && ok.exchangeGrams === 80, ok);
const throws = (fn: () => unknown) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
check("rechaza kcal que no cuadran (error ×10)", throws(() => validateFoodInput({ name: "Maní", kcal: 57, proteinG: 25.8, carbsG: 16.1, fatG: 49.2 })));
check("rechaza macros > 100 g", throws(() => validateFoodInput({ name: "X", kcal: 800, proteinG: 60, carbsG: 30, fatG: 20 })));
check("rechaza código de barras corto", throws(() => validateFoodInput({ name: "X", kcal: 100, proteinG: 5, carbsG: 15, fatG: 2, barcode: "123" })));

check("reparto por comida se normaliza a 100", Object.values(normalizeMealSplit({ breakfast: 1, lunch: 1 })).reduce((a, b) => a + b, 0) === 100);

// ── CSV semilla ────────────────────────────────────────────────────────────
const foods = parseFoodsCsv(readFileSync(resolve(__dirname, "../prisma/seed-data/foods-ec.csv"), "utf8"));
check(`CSV: ${foods.length} alimentos parseados`, foods.length > 180);
const bad = foods.filter((f) => {
  try {
    validateFoodInput({ ...f, portions: f.portions, exchangeGroup: f.group });
    return false;
  } catch {
    return true;
  }
});
check("todos los alimentos del CSV pasan la validación", bad.length === 0, bad.map((b) => b.name));
const names = foods.map((f) => normalizeSearch(f.name));
check("sin nombres duplicados", new Set(names).size === names.length);
const chocho = foods.find((f) => f.name.startsWith("Chocho"));
check("chocho tiene porciones", (chocho?.portions.length ?? 0) === 2);

// ── Parser de recetas del blog ─────────────────────────────────────────────
check("gramos de '1 pepino (aproximadamente 150 gramos)'", gramsFromLabel("1 pepino (aproximadamente 150 gramos)") === 150);
check("gramos de '100g de pechuga'", gramsFromLabel("100g de pechuga de pollo (peso crudo)") === 100);
check("sin gramos", gramsFromLabel("Sal y pimienta (al gusto)") === null);
check("título limpio", cleanTitle("Receta Cevichocho Saludable | La Cueva Fitness Center") === "Cevichocho");
const sample = `TÍTULO: Receta Wrap | La Cueva
FECHA: 2023-04-28
URL: https://x/wrap/

Un wrap rico.
 Ingredientes 
 100g de pollo 
 1 tortilla 
 Instrucciones 
 Cocinar el pollo. 
 Armar. 
 Tabla Nutricional 
 Calorías 
 318 kcal 
 Proteínas 
 25 g 
 Grasas 
 9 g 
 Grasas saturadas 
 2 g 
 Hidratos de carbono 
 34 g 
 Fibra 
 4 g 
 Esta receta rinde para 2 porciones.`;
const p = parseBlogRecipe(sample);
check(
  "parsea receta con tabla aplanada",
  !!p && p.title === "Wrap" && p.ingredients.length === 2 && p.ingredients[0].grams === 100 &&
    p.servings === 2 && JSON.stringify(p.nutrition) === JSON.stringify({ kcal: 318, proteinG: 25, carbsG: 34, fatG: 9, fiberG: 4 }),
  p,
);
const seedRecipes = JSON.parse(readFileSync(resolve(__dirname, "../prisma/seed-data/recipes-blog.json"), "utf8"));
check(`JSON de recetas: ${seedRecipes.length} con tabla`, seedRecipes.length >= 20 && seedRecipes.every((r: { nutrition: unknown }) => r.nutrition));

console.log(fallos === 0 ? "\nTodo OK" : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
