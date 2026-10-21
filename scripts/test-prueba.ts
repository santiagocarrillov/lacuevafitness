/**
 * Prueba de los toques de la prueba de $9 (src/lib/whatsapp/trial-touches.ts).
 *
 * Lo que protege (plan Fase 2, 20 oct 2026): check-in el día 3, mitad el día 7 y
 * cierre 3 días antes de que termine; uno por día como máximo, nada en domingo
 * ni después de que terminó, y el agente sabe que la persona ya está en su prueba.
 *
 * Pura: no toca la BD ni WhatsApp.  Uso:  npm run test:prueba
 */

import { trialAgentContext, trialDay, trialTouch } from "../src/lib/whatsapp/trial-touches";
import { TEMPLATE_CATALOG } from "../src/lib/whatsapp/template-catalog";
import { addDays } from "../src/lib/nutrition/appointments";
import { weekdayOf } from "../src/lib/nutrition/slots";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${!ok && detalle ? `\n   ${detalle}` : ""}`);
}

/** Every touch of a trial, day by day: { "YYYY-MM-DD": kind }. */
function calendar(start: string, days = 14): Record<string, string> {
  const end = addDays(start, days);
  const out: Record<string, string> = {};
  for (let d = addDays(start, -1); d <= addDays(end, 2); d = addDays(d, 1)) {
    const k = trialTouch(start, end, d);
    if (k) out[d] = k;
  }
  return out;
}

// Lunes 19 oct 2026 → termina el lunes 2 nov (14 días, como endsAt = startsAt + 14).
const LUNES = "2026-10-19";
check("19 oct 2026 es lunes", weekdayOf(LUNES) === 1);
const cal = calendar(LUNES);
const first = (kind: string) => Object.keys(cal).find((d) => cal[d] === kind);

check("día 3 sale el miércoles 21", first("PRUEBA_DIA3") === "2026-10-21", JSON.stringify(cal));
check("día 7 cae domingo 25: sale el lunes 26", first("PRUEBA_DIA7") === "2026-10-26", JSON.stringify(cal));
check("cierre sale el viernes 30 (3 días antes del 2 nov)", first("PRUEBA_CIERRE") === "2026-10-30", JSON.stringify(cal));
check("nada en domingo", Object.keys(cal).every((d) => weekdayOf(d) !== 7));
check("nada antes de empezar", trialTouch(LUNES, "2026-11-02", "2026-10-18") === null);
check("nada después de terminar", trialTouch(LUNES, "2026-11-02", "2026-11-03") === null);
check("2 días antes todavía es cierre (se pone al día)", trialTouch(LUNES, "2026-11-02", "2026-10-31") === "PRUEBA_CIERRE");
check("el último día ya no sale (queda la tarea del staff)", trialTouch(LUNES, "2026-11-02", "2026-11-01") === null && trialTouch(LUNES, "2026-11-02", "2026-11-02") === null);
check("día 1 y 2 no tienen toque", !cal["2026-10-19"] && !cal["2026-10-20"]);

// Empieza un viernes: el día 3 cae en domingo y se pone al día el lunes.
const VIERNES = "2026-10-23";
const calV = calendar(VIERNES);
check("viernes: el día 3 (domingo) pasa al lunes 26", Object.keys(calV).find((d) => calV[d] === "PRUEBA_DIA3") === "2026-10-26", JSON.stringify(calV));

// Una prueba de 5 días (cargada tarde): solo cierre, nunca dos toques el mismo día.
const corta = "2026-10-20";
check("prueba corta: el día 3 ya es cierre", trialTouch(corta, addDays(corta, 5), addDays(corta, 2)) === "PRUEBA_CIERRE");

// Día del calendario de la prueba.
const td = trialDay(LUNES, "2026-11-02", "2026-10-25");
check("25 oct es el día 7 de 14 y faltan 8", td.dayN === 7 && td.totalDays === 14 && td.daysLeft === 8, JSON.stringify(td));

// Contexto del agente.
const mitad = trialAgentContext({ startDay: LUNES, endDay: "2026-11-02", today: "2026-10-25", visits: 3 });
check("contexto: dice el día y los entrenamientos", mitad.includes("día 7 de 14") && mitad.includes("registrados desde que empezó: 3"), mitad);
check("contexto: prohíbe el $9 y agendar primera sesión", mitad.includes("NO le ofrezcas las dos semanas por $9") && mitad.includes("NO agendes"));
check("contexto a mitad: sin modo cierre", !mitad.includes("Estamos en el CIERRE"));
const cierre = trialAgentContext({ startDay: LUNES, endDay: "2026-11-02", today: "2026-10-30", visits: 6 });
check("contexto al final: modo cierre con la escalera de precio", cierre.includes("Estamos en el CIERRE") && cierre.includes("$50") && cierre.includes("$40"), cierre);
check("contexto el último día: «terminan HOY»", trialAgentContext({ startDay: LUNES, endDay: "2026-11-02", today: "2026-11-02", visits: 6 }).includes("terminan HOY"));
check("contexto sin voseo", !/\b(querés|podés|tenés|vení|contame)\b/i.test(mitad + cierre));

// Plantillas: existen, las variables cuadran y el texto no usa voseo.
for (const name of ["prueba_checkin", "prueba_mitad", "prueba_cierre"]) {
  const t = TEMPLATE_CATALOG.find((x) => x.name === name);
  if (!t) { check(`plantilla ${name} en el catálogo`, false); continue; }
  const vars = new Set(t.body.match(/\{\{\d+\}\}/g) ?? []);
  check(`plantilla ${name}: ${vars.size} variables = ${t.variables.length} = ejemplos ${t.example.length}`, vars.size === t.variables.length && t.example.length === t.variables.length);
  check(`plantilla ${name}: no empieza ni termina con variable y cabe en 1024`, !/^\{\{|\}\}$/.test(t.body.trim()) && t.body.length <= 1024);
  check(`plantilla ${name}: sin voseo`, !/\b(querés|podés|tenés|vení|contame)\b/i.test(t.body));
}

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien.");
process.exit(fallos ? 1 : 0);
