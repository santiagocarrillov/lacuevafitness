/**
 * Prueba del contenido estructurado de los planes (src/lib/nutrition/plan-schema.ts):
 * validación, totales por comida/día, promedio semanal, intercambios y reescalado.
 *
 * Uso:  npm run test:nutricion-planes
 */
import {
  defaultTargets,
  emptyPlanContent,
  exchangeMealTotals,
  menuDayFor,
  parsePlanContent,
  planAverageTotals,
  planContentSchema,
  planDayTotals,
  scalePlan,
  type PlanContent,
  type PlanItem,
} from "../src/lib/nutrition/plan-schema";
import { adherenceFromChecks, isoWeekday, levelFromPct } from "../src/lib/nutrition/adherence";
import { buildDay, itemAmount } from "../src/components/portal/nutrition/view-model";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${!ok && detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
}

const item = (name: string, grams: number, kcal: number, p: number, c: number, f: number): PlanItem => ({
  foodId: null, recipeId: null, name, grams, servings: null, portionLabel: null, kcal, proteinG: p, carbsG: c, fatG: f,
});

// ── Plan vacío ─────────────────────────────────────────────────────────────
const blank = emptyPlanContent("MENU", defaultTargets(1600));
check("plan vacío valida con el schema", planContentSchema.safeParse(blank).success);
check("metas por defecto 30/45/25", blank.targets.proteinG === 120 && blank.targets.carbsG === 180 && blank.targets.fatG === 44, blank.targets);
check("vacío suma 0 kcal", planDayTotals(blank).total.kcal === 0);
check("JSON inválido → null", parsePlanContent({ kind: "MENU" }) === null && parsePlanContent(null) === null);

// ── Menú con opciones ──────────────────────────────────────────────────────
const menu: PlanContent = {
  ...blank,
  meals: blank.meals.filter((m) => m.key === "breakfast" || m.key === "lunch"),
  days: [
    {
      day: "ALL",
      meals: [
        {
          key: "breakfast",
          options: [
            { id: "a", label: "Avena", notes: null, items: [item("Avena", 40, 152, 5.3, 27.1, 2.6), item("Banano", 118, 105, 1.3, 26.9, 0.4)] },
            { id: "b", label: "Huevos", notes: null, items: [item("Huevo", 100, 143, 12.6, 0.7, 9.5)] },
            { id: "c", label: "", notes: null, items: [] }, // opción vacía: no cuenta en el promedio
          ],
        },
        { key: "lunch", options: [{ id: "d", label: "Pollo", notes: null, items: [item("Pollo", 150, 248, 46.5, 0, 5.4), item("Arroz", 158, 205, 4.3, 44.6, 0.5)] }] },
        // Una comida deshabilitada con datos no debe sumar.
        { key: "dinner", options: [{ id: "e", label: "", notes: null, items: [item("Pizza", 300, 800, 30, 90, 30)] }] },
      ],
    },
  ],
};
check("menú valida con el schema", planContentSchema.safeParse(menu).success);
const t = planDayTotals(menu);
check("desayuno = promedio de las opciones con ítems", t.meals.breakfast?.kcal === Math.round((257 + 143) / 2), t.meals.breakfast);
check("total = desayuno + almuerzo (cena deshabilitada no suma)", t.total.kcal === 200 + 453, t.total);

// ── Menú por día ───────────────────────────────────────────────────────────
const perDay: PlanContent = {
  ...menu,
  days: [
    { day: 1, meals: [{ key: "lunch", options: [{ id: "x", label: "", notes: null, items: [item("A", 100, 600, 30, 60, 20)] }] }] },
    { day: 2, meals: [{ key: "lunch", options: [{ id: "y", label: "", notes: null, items: [item("B", 100, 400, 20, 40, 10)] }] }] },
  ],
};
check("promedio semanal", planAverageTotals(perDay).kcal === 500, planAverageTotals(perDay));
check("menuDayFor martes", menuDayFor(perDay, 2)?.day === 2);
check("menuDayFor domingo sin menú propio cae al primero", menuDayFor(perDay, 7)?.day === 1);
check("menuDayFor con ALL", menuDayFor(menu, 5)?.day === "ALL");

// ── Intercambios ───────────────────────────────────────────────────────────
const ex = emptyPlanContent("EXCHANGES", defaultTargets(1500));
ex.exchanges = ex.exchanges.map((m) =>
  m.key === "lunch" ? { ...m, groups: { PROTEIN: 3, STARCH: 2, VEGETABLE: 2, FAT: 1 } } : m.key === "breakfast" ? { ...m, groups: { DAIRY: 1, FRUIT: 1, STARCH: 1.5 } } : m,
);
check("intercambios validan", planContentSchema.safeParse(ex).success);
check("almuerzo: 3P + 2A + 2V + 1G = 480 kcal", exchangeMealTotals(ex.exchanges.find((m) => m.key === "lunch")!).kcal === 3 * 75 + 2 * 80 + 2 * 25 + 45);
check("total del día de intercambios", planDayTotals(ex).total.kcal === 480 + 120 + 60 + 120);

// ── Reescalado ─────────────────────────────────────────────────────────────
const big = scalePlan(menu, 1306); // el menú suma 653 → ×2
const lunchItems = big.days[0].meals.find((m) => m.key === "lunch")!.options[0].items;
check("reescalar duplica los gramos", lunchItems[0].grams === 300 && lunchItems[1].grams === 315, lunchItems.map((i) => i.grams));
check("…y los nutrientes siguen a los gramos redondeados", lunchItems[1].kcal === Math.round(205 * (315 / 158)), lunchItems[1]);
check("las metas se mueven al nuevo kcal", big.targets.kcal === 1306);
check("el total queda cerca del objetivo (±3%)", Math.abs(planDayTotals(big).total.kcal - 1306) <= 1306 * 0.03, planDayTotals(big).total);
const exSmall = scalePlan(ex, 390); // 780 → ×0.5
const lunchEx = exSmall.exchanges.find((m) => m.key === "lunch")!.groups;
check("intercambios se escalan en pasos de ½", lunchEx.PROTEIN === 1.5 && lunchEx.STARCH === 1 && lunchEx.FAT === 0.5, lunchEx);
check("reescalar no muta el original", menu.days[0].meals[1].options[0].items[0].grams === 150);
check("reescalado sigue siendo válido", planContentSchema.safeParse(big).success && planContentSchema.safeParse(exSmall).success);

// ── Adherencia (semáforo automático) ───────────────────────────────────────
const cinco = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
check("sin marcar = sin color (no es rojo)", adherenceFromChecks(cinco, []).level === null);
check("5/5 → verde", adherenceFromChecks(cinco, cinco.map((k) => ({ mealKey: k, ate: true }))).level === "GREEN");
check("3/5 → amarillo (60%)", adherenceFromChecks(cinco, cinco.slice(0, 3).map((k) => ({ mealKey: k, ate: true }))).level === "YELLOW");
check("1 cumplida y 1 no de 5 → rojo (20%)", adherenceFromChecks(cinco, [{ mealKey: "breakfast", ate: true }, { mealKey: "lunch", ate: false }]).level === "RED");
check("marcas de comidas fuera del plan no cuentan", adherenceFromChecks(["lunch"], [{ mealKey: "dinner", ate: true }]).level === null);
check("umbrales", levelFromPct(81) === "GREEN" && levelFromPct(80) === "YELLOW" && levelFromPct(40) === "ORANGE" && levelFromPct(39) === "RED");
check("isoWeekday: 28 sep 2026 es lunes, 4 oct domingo", isoWeekday("2026-09-28") === 1 && isoWeekday("2026-10-04") === 7);

// ── Vista del socio ────────────────────────────────────────────────────────
const vm = buildDay(menu, menu.days[0]);
check("la vista solo trae comidas habilitadas", vm.meals.map((m) => m.key).join() === "breakfast,lunch");
check("opciones vacías no se muestran", vm.meals[0].options.length === 2);
check("cantidad con medida casera", itemAmount({ ...item("Arroz", 158, 205, 4, 44, 0), portionLabel: "1 taza" }) === "1 taza (158 g)");
check("cantidad de receta", itemAmount({ ...item("Wrap", 1, 300, 20, 30, 10), grams: null, recipeId: "r", servings: 2 }) === "2 porciones");
const vmEx = buildDay(ex, null);
check("intercambios en la vista", vmEx.meals.find((m) => m.key === "lunch")?.groups.length === 4);

console.log(fallos === 0 ? "\nTodo OK" : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
