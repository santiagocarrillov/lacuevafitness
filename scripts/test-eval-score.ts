/**
 * SRXFIT › Evaluaciones — avance ponderado (cada test pesa distinto; ≥ 60 % = evaluado).
 *
 * Uso:  npx tsx scripts/test-eval-score.ts
 */
import { EVAL_COMPLETE_PCT, EVAL_SLOTS, evalScore, evalStatus } from "../src/lib/srxfit/eval-score";
import { evalWindow } from "../src/lib/srxfit/eval-panel";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const total = EVAL_SLOTS.reduce((a, s) => a + s.weight, 0);
check("Los pesos suman 100", total === 100, `${total}`);
check("El umbral es 60 %", EVAL_COMPLETE_PCT === 60);

const empty = evalScore({ tests: [], body: null });
check("Sin datos → 0 % pendiente", empty.pct === 0 && evalStatus(empty.pct) === "pendiente");

const bodyOnly = evalScore({ tests: [], body: { weightKg: 80, bodyFatPct: 22 } });
check("Solo composición → 20 % parcial", bodyOnly.pct === 20 && evalStatus(bodyOnly.pct) === "parcial");

const weightOnly = evalScore({ tests: [], body: { weightKg: 80, bodyFatPct: null } });
check("Peso sin % grasa → 10 %", weightOnly.pct === 10);

const ringRow = evalScore({ tests: ["RING_ROW_ANGLE"] });
const both = evalScore({ tests: ["RING_ROW_ANGLE", "PULL_UPS_MAX"] });
check("Ring row llena el hueco de dominadas, sin sumar doble", ringRow.pct === 10 && both.pct === 10);

const olympic = evalScore({ tests: ["CLEAN_JERK_1RM", "SNATCH_1RM", "ROW_500M_SPRINT_SECONDS"] });
check("Olímpicos opcionales no suman", olympic.pct === 0);

// Lunes + martes + composición: 20 + 20 + 10 (press) + 10 (tracción) + 10 (core) = 70 → evaluado
const week = evalScore({
  tests: ["BACK_SQUAT_3RM", "DEADLIFT_3RM", "BENCH_PRESS_3RM", "PUSH_PRESS_3RM", "PULL_UPS_MAX", "PLANK_SECONDS", "DEAD_HANG_SECONDS"],
  body: { weightKg: 70, bodyFatPct: 25 },
});
check("Composición + lunes + martes → 70 % evaluado", week.pct === 70 && week.complete && evalStatus(week.pct) === "evaluado", `${week.pct}%`);

// Faltó la composición y el martes: 20 + 15 + 15 = 50 → parcial
const noBody = evalScore({ tests: ["BACK_SQUAT_3RM", "DEADLIFT_3RM", "CHRISTINE_TIME_SECONDS", "COOPER_METERS"] });
check("Lunes + miércoles + jueves sin composición → 50 % parcial", noBody.pct === 50 && !noBody.complete, `${noBody.pct}%`);

const sixty = evalScore({ tests: ["CHRISTINE_TIME_SECONDS", "COOPER_METERS", "BACK_SQUAT_3RM"], body: { weightKg: 1, bodyFatPct: 1 } });
check("Exactamente 60 % ya cuenta", sixty.pct === 60 && sixty.complete);

const all = evalScore({
  tests: ["BACK_SQUAT_3RM", "DEADLIFT_3RM", "BENCH_PRESS_3RM", "PUSH_PRESS_3RM", "PULL_UPS_MAX", "PLANK_SECONDS", "DEAD_HANG_SECONDS", "CHRISTINE_TIME_SECONDS", "COOPER_METERS"],
  body: { weightKg: 70, bodyFatPct: 25 },
});
check("Batería completa → 100 %", all.pct === 100);

// Ventana: período del mes o los últimos 21 días, lo que empiece antes.
const now = new Date("2026-10-04T15:00:00Z");
const w = evalWindow("2026-10-01", "2026-10-04", now);
check("Al inicio de mes la ventana abarca la semana anterior", w.start.getTime() <= new Date("2026-09-13T15:00:00Z").getTime(), w.start.toISOString());
const past = evalWindow("2026-07-01", "2026-07-31", now);
check("Período pasado: la ventana empieza en ese período", past.start.toISOString().startsWith("2026-07-01"), past.start.toISOString());

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
