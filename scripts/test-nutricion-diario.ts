/**
 * Prueba de la lógica del diario (pura): meta diaria, presupuesto por comida
 * ("me pasé en el almuerzo, ¿cuánto me queda?"), sugerencias, reemplazos y racha.
 *
 * Uso:  npm run test:nutricion-diario
 */
import { computeDayBudget } from "../src/lib/nutrition/budget";
import { gramsForKcal, suggestForMeal, type Candidate } from "../src/lib/nutrition/suggest";
import { equivalentSwaps } from "../src/lib/nutrition/swap";
import { resolveDailyTarget } from "../src/lib/nutrition/target";
import { loggingStreak } from "../src/lib/nutrition/progress";
import type { MealKey } from "../src/lib/nutrition/meals";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${!ok && detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
}

const meals: MealKey[] = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
const split = { breakfast: 25, snack_am: 10, lunch: 35, snack_pm: 10, dinner: 20 };

// ── Presupuesto ────────────────────────────────────────────────────────────
// Meta 2000. Desayuno 500 (plan 500), media mañana 200 (plan 200), almuerzo 950 (plan 700 → +250).
const b = computeDayBudget({
  target: 2000,
  split,
  meals,
  consumedByMeal: { breakfast: 500, snack_am: 200, lunch: 950 },
  hasEntries: { breakfast: true, snack_am: true, lunch: true },
});
check("consumido y restante", b.consumed === 1650 && b.remaining === 350, b);
check("detecta que se pasó en el almuerzo", b.overMeals.length === 1 && b.overMeals[0].key === "lunch" && b.overMeals[0].over === 250, b.overMeals);
const snack = b.meals.find((m) => m.key === "snack_pm")!;
const dinner = b.meals.find((m) => m.key === "dinner")!;
check("reparte lo que queda: media tarde ≈117, merienda ≈233", snack.suggested === 117 && dinner.suggested === 233, { snack, dinner });
check("mensaje de solución", b.message?.startsWith("Te pasaste 250 kcal en almuerzo → te quedan 350 kcal") ?? false, b.message);
check("siguiente comida abierta", b.nextOpenMeal === "snack_pm");

const empty = computeDayBudget({ target: 1800, split, meals, consumedByMeal: {}, hasEntries: {} });
check("sin nada registrado no hay mensaje", empty.message === null && empty.remaining === 1800);
check("sin registro, cada comida sugiere su parte", empty.meals.find((m) => m.key === "lunch")?.suggested === 630);

const over = computeDayBudget({ target: 1500, split, meals, consumedByMeal: { breakfast: 900, lunch: 800 }, hasEntries: { breakfast: true, lunch: true } });
check("pasado de la meta del día", over.remaining === -200 && (over.message?.includes("Te pasaste 200 kcal de tu meta") ?? false), over.message);
check("…y las comidas abiertas sugieren 0", over.meals.filter((m) => !m.closed).every((m) => m.suggested === 0));

// ── Sugerencias ────────────────────────────────────────────────────────────
const cands: Candidate[] = [
  { id: "1", kind: "food", name: "Yogur griego", kcal: 150, proteinG: 17, carbsG: 6, fatG: 1, refId: "a" },
  { id: "2", kind: "food", name: "Galletas", kcal: 220, proteinG: 3, carbsG: 30, fatG: 10, refId: "b" },
  { id: "3", kind: "plan", name: "Tu plan: fruta y queso", kcal: 180, proteinG: 8, carbsG: 20, fatG: 7, refId: "c" },
  { id: "4", kind: "recipe", name: "Pizza", kcal: 600, proteinG: 30, carbsG: 60, fatG: 25, refId: "d" },
  { id: "5", kind: "food", name: "Almendras", kcal: 40, proteinG: 1.5, carbsG: 1.5, fatG: 3.5, refId: "e" },
];
const sug = suggestForMeal(cands, 200, 40);
check("descarta lo que no cabe (pizza) o es muy poco (almendras)", !sug.some((s) => s.name === "Pizza" || s.name === "Almendras"), sug.map((s) => s.name));
check("el plan va primero", sug[0]?.kind === "plan", sug.map((s) => s.name));
check("con brecha de proteína, yogur antes que galletas", sug.findIndex((s) => s.name === "Yogur griego") < sug.findIndex((s) => s.name === "Galletas"));
check("sin presupuesto no sugiere", suggestForMeal(cands, 40, 10).length === 0);
check("gramos para 200 kcal de arroz (130/100 g) = 155 g", gramsForKcal(130, 200) === 155);

// ── Reemplazos ─────────────────────────────────────────────────────────────
const arroz = { id: "arroz", name: "Arroz", kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, fiberG: 0.4, isLiquid: false };
const quinua = { id: "quinua", name: "Quinua", kcal: 120, proteinG: 4.4, carbsG: 21.3, fatG: 1.9, fiberG: 2.8, isLiquid: false };
const avena = { id: "avena", name: "Avena cruda", kcal: 379, proteinG: 13.2, carbsG: 67.7, fatG: 6.5, fiberG: 10, isLiquid: false };
const sw = equivalentSwaps(205, 158, [arroz, quinua, avena], "arroz");
check("no se sugiere a sí mismo", !sw.some((s) => s.food.id === "arroz"));
check("quinua en la cantidad equivalente (≈170 g)", sw.find((s) => s.food.id === "quinua")?.grams === 170, sw);
check("avena seca: 55 g equivalen (≥ ⅓ de 158 g) → entra", sw.find((s) => s.food.id === "avena")?.grams === 55, sw.map((s) => [s.food.id, s.grams]));
const aceite = { id: "aceite", name: "Aceite", kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0, isLiquid: false };
check("aceite: 25 g sería < ⅓ de la cantidad → fuera", !equivalentSwaps(205, 158, [aceite]).length);

// ── Meta diaria ────────────────────────────────────────────────────────────
const stored = { kcal: 1700, proteinG: 120, carbsG: 170, fatG: 55, mealSplit: split, source: "MEMBER" as const };
const planT = { targets: { kcal: 1500, proteinG: 110, carbsG: 150, fatG: 50 }, meals: ["breakfast", "lunch", "dinner"] as MealKey[] };
const t1 = resolveDailyTarget(planT, stored);
check("el plan manda sobre la meta guardada", t1?.kcal === 1500 && t1.source === "PLAN");
check("el plan decide qué comidas hay", t1?.meals.join() === "breakfast,lunch,dinner");
check("el reparto se renormaliza a esas comidas", Math.round(Object.values(t1!.mealSplit).reduce((a, b) => a + b, 0)) === 100 && t1!.mealSplit.lunch === 43.8, t1?.mealSplit);
check("sin plan usa la meta guardada", resolveDailyTarget(null, stored)?.source === "MEMBER");
check("sin nada no hay meta", resolveDailyTarget(null, null) === null);

// ── Racha ──────────────────────────────────────────────────────────────────
check("racha cuenta hasta ayer si hoy está vacío", loggingStreak([{ kcal: 0 }, { kcal: 1500 }, { kcal: 1800 }, { kcal: 0 }]) === 2);
check("racha incluye hoy", loggingStreak([{ kcal: 1500 }, { kcal: 1800 }]) === 2);

console.log(fallos === 0 ? "\nTodo OK" : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
