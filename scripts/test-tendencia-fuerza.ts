/**
 * Pruebas de la tendencia de fuerza de la ficha (Manual SRXFIT v3, 9.5), sin base de datos.
 * npx tsx scripts/test-tendencia-fuerza.ts
 */
import { strengthTrends, type TrendSet } from "../src/lib/srxfit/strength-trend";

let fails = 0;
const check = (ok: boolean, what: string, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`);
};

const day = (n: number) => new Date(Date.UTC(2026, 9, n));
const set = (exercise: string, n: number, loadKg: number, reps = 5, rir = 2): TrendSet => ({ exercise, date: day(n), loadKg, reps, rir });

check(strengthTrends([]).length === 0, "sin series: sin tendencias");

// Menos de tres sesiones: se lista, sin tendencia.
const two = strengthTrends([set("Back Squat", 1, 80), set("Back Squat", 8, 85)]);
check(two.length === 1 && two[0].sessions === 2 && two[0].trend === null, "dos sesiones: sin tendencia");

// Sube: la carga crece con las mismas reps.
const up = strengthTrends([set("Back Squat", 1, 80), set("back  squat", 8, 85), set("BACK SQUAT", 15, 90)])[0];
check(up.sessions === 3, "agrupa el mismo ejercicio aunque cambie mayúsculas o espacios");
check(up.trend?.direction === "up" && (up.trend?.deltaKg ?? 0) > 0, "tres sesiones con más carga: sube", JSON.stringify(up.trend));
check(up.exercise === "BACK SQUAT" && up.last.loadKg === 90, "muestra la última serie");
check(up.points[0].e1rm < up.points[2].e1rm, "puntos ordenados del más viejo al más nuevo");

// Baja: misma carga, menos reps cada vez.
const down = strengthTrends([set("Bench", 15, 60, 3, 0), set("Bench", 1, 60, 6, 1), set("Bench", 8, 60, 5, 0)])[0];
check(down.trend?.direction === "down", "misma carga con menos reps: baja", JSON.stringify(down.trend));

// Estable: variación menor al 2 %.
const flat = strengthTrends([set("Deadlift", 1, 100), set("Deadlift", 8, 100), set("Deadlift", 15, 101)])[0];
check(flat.trend?.direction === "flat", "variación mínima: estable", JSON.stringify(flat.trend));

// Un valor atípico en medio no decide la tendencia.
const noisy = strengthTrends([set("Press", 1, 40), set("Press", 5, 30), set("Press", 8, 42), set("Press", 12, 44)])[0];
check(noisy.trend?.direction === "up", "un mal día en medio no vuelve la tendencia negativa", JSON.stringify(noisy.trend));

// Orden: el ejercicio entrenado más recientemente va primero.
const order = strengthTrends([set("A", 1, 50), set("B", 9, 50), set("A", 3, 50)]);
check(order[0].exercise === "B", "primero el ejercicio más reciente");

console.log(fails ? `\n${fails} fallas` : "\nTodo bien");
process.exit(fails ? 1 : 0);
