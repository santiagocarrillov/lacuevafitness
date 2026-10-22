/**
 * Prueba del rescate de no-show en tres toques (22 oct 2026), sin tocar la base
 * ni mandar nada:
 *
 *  1. Cuándo sale cada toque: el primero ya (o a las 8 si faltó de noche), y los
 *     de día 3 y 7 siempre dentro de la franja de envío.
 *  2. Qué plantilla le toca a cada toque y que los textos nuevos se lean bien
 *     (una sola variable, sin enlaces, sin voseo, sin "¿Fitness o Xtreme?").
 *  3. La tarea de llamada del día 7: una por cita (la clave usa el día de la cita
 *     en Ecuador, no en UTC), para la sede del lead y con fecha de hoy.
 *
 * Uso:  npm run test:noshow
 */

import "dotenv/config";
import { NOSHOW_KINDS, NO_REPLY_STAGES, noShowTimes } from "../src/lib/whatsapp/sequences";
import { renderTemplate, templateForFollowup } from "../src/lib/whatsapp/templates";
import { TEMPLATE_CATALOG } from "../src/lib/whatsapp/template-catalog";
import { noShowTaskPlan } from "../src/lib/leads/noshow-task";

let fallos = 0;
function check(ok: boolean, label: string, detail?: string) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok && detail) console.log(`   ${detail}`);
}
const ec = (iso: string) => new Date(`${iso}-05:00`);
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short", timeZone: "America/Guayaquil", hour12: false }).format(d);
const same = (a: Date, b: Date) => a.getTime() === b.getTime();

// ── 1. Cuándo sale cada toque ───────────────────────────────────────────────
console.log("Cuándo sale cada toque (contando desde que el cron marca el no-show):");
const casos: Array<[string, string, string, string, string]> = [
  // [marcado (hora EC), primero, día 3, día 7, por qué]
  ["2026-10-22T11:00", "2026-10-22T11:01", "2026-10-25T11:00", "2026-10-29T11:00", "cita de las 8 am: sale a media mañana"],
  ["2026-10-22T22:30", "2026-10-23T08:00", "2026-10-26T08:00", "2026-10-30T08:00", "cita de las 7:30 pm: nada de noche, a las 8"],
  ["2026-10-30T20:59", "2026-10-31T08:00", "2026-11-02T20:59", "2026-11-06T20:59", "en el filo de las 21: el primero (+1 min) espera a las 8; los otros caben"],
];
for (const [marked, first, d3, d7, why] of casos) {
  const t = noShowTimes(ec(marked));
  const firstExpected = ec(first);
  const ok = same(t.first, firstExpected) && same(t.day3, ec(d3)) && same(t.day7, ec(d7));
  check(ok, `${marked.slice(5)} → ${hhmm(t.first)} · ${hhmm(t.day3)} · ${hhmm(t.day7)} — ${why}`,
    `esperaba ${hhmm(firstExpected)} · ${hhmm(ec(d3))} · ${hhmm(ec(d7))}`);
}

// ── 2. Plantillas ───────────────────────────────────────────────────────────
console.log("\nQué plantilla le toca a cada toque:");
const ctx = { firstName: "🩷 María", lastName: "José", sede: null, trialScheduledAt: null };
const esperado: Record<string, string> = {
  NOSHOW_RECOVERY_1D: "noshow_recuperacion",
  NOSHOW_RECOVERY_3D: "noshow_dia3",
  NOSHOW_RECOVERY_7D: "noshow_dia7",
};
for (const kind of NOSHOW_KINDS) {
  const spec = templateForFollowup(kind, ctx);
  check(spec?.name === esperado[kind], `${kind} → ${spec?.name ?? "ninguna"}`);
  if (spec) {
    const text = renderTemplate(spec);
    check(text.startsWith("¡Hola María!") && !text.includes("{{"), `  se llena con el nombre limpio: «${text.slice(0, 60)}…»`);
  }
}

console.log("\nTextos nuevos del catálogo:");
const VOSEO = /\b(contame|vení|mirá|tenés|querés|podés|sos|fijate|escribime|bacán|vale|guay)\b/i;
for (const name of ["noshow_dia3", "noshow_dia7"]) {
  const t = TEMPLATE_CATALOG.find((x) => x.name === name);
  if (!t) { check(false, `${name} está en el catálogo`); continue; }
  const vars = t.body.match(/\{\{\d+\}\}/g) ?? [];
  check(vars.length === 1 && vars[0] === "{{1}}", `${name}: una sola variable ({{1}} = nombre)`);
  check(t.example.length === 1 && t.variables.length === 1, `${name}: ejemplo y variables cuadran`);
  check(!/https?:|www\./i.test(t.body), `${name}: sin enlaces (Meta los frena)`);
  check(!VOSEO.test(t.body), `${name}: sin voseo ni "bacán"`);
  check(!/fitness o xtreme|xtreme o fitness|qué sede/i.test(t.body), `${name}: no pregunta «¿Fitness o Xtreme?»`);
  check(t.body.length <= 1024, `${name}: cabe en el límite de Meta (${t.body.length}/1024)`);
  check(t.category === "MARKETING", `${name}: categoría Marketing (lleva la oferta de $9)`);
}

console.log("");
check(NO_REPLY_STAGES.includes("TRIAL_NO_SHOW"), "Un no-show que contesta y vuelve a callarse entra a la cadencia de no respuesta");

// ── 3. Tarea de llamada del día 7 ───────────────────────────────────────────
console.log("\nTarea de llamada del día 7:");
const lead = { id: "lead123", firstName: "Kathy", lastName: "Pérez", sede: "FITNESS_CENTER" as const, phone: "593999999999" };
// Cita a las 7:30 pm del 15 oct en Ecuador = 00:30 UTC del 16: la clave es del 15.
const cita = ec("2026-10-15T19:30");
const plan = noShowTaskPlan(lead, cita, ec("2026-10-22T10:00"));
check(plan.autoKey === "noshow:lead123:2026-10-15", `clave por cita en hora de Ecuador: ${plan.autoKey}`);
check(plan.dueDate.toISOString().slice(0, 10) === "2026-10-22", `para hoy (22 oct): ${plan.dueDate.toISOString().slice(0, 10)}`);
check(plan.type === "CALL" && plan.sede === "FITNESS_CENTER" && plan.leadId === "lead123", "llamada, en la sede del lead, atada al lead");
check(plan.title.includes("Kathy Pérez") && plan.title.includes("15 oct"), `título: «${plan.title}»`);
check(plan.detail.includes("593999999999"), "lleva el teléfono para llamar sin abrir la ficha");
const plan2 = noShowTaskPlan(lead, ec("2026-10-20T07:00"), ec("2026-10-27T10:00"));
check(plan2.autoKey !== plan.autoKey, "otro plantón del mismo lead es otra tarea");

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
