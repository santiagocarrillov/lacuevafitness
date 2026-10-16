/**
 * Prueba de la franja horaria de envío.
 *
 * Lo que protege: que un plantón de las 8 de la noche no dispare un WhatsApp a
 * las 11, y que uno de madrugada espere a la mañana. No es cosmética — el lote
 * de reenganche que salió a las 06:00 del 21 sep 2026 tuvo 0 respuestas de 12,
 * contra 40% del que salió a las 08:00. Las horas muertas queman leads.
 *
 * Uso:  npx tsx scripts/test-followups.ts
 */

import "dotenv/config";
import { nextSendableAt, noReplyTimes } from "../src/lib/whatsapp/sequences";

/** Construye un instante a partir de la hora de Ecuador. */
const ec = (iso: string) => new Date(`${iso}-05:00`);
const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short", timeZone: "America/Guayaquil", hour12: false }).format(d);

const casos: Array<[string, string, string]> = [
  // [entrada (hora EC), salida esperada (hora EC), por qué]
  ["2026-09-22T10:00", "2026-09-22T10:00", "media mañana: sale ya"],
  ["2026-09-22T08:00", "2026-09-22T08:00", "borde inferior: 8 en punto ya es franja"],
  ["2026-09-22T20:59", "2026-09-22T20:59", "borde superior: 20:59 todavía entra"],
  ["2026-09-22T21:00", "2026-09-23T08:00", "21:00 ya no: mañana temprano"],
  ["2026-09-22T23:30", "2026-09-23T08:00", "plantón nocturno: no se escribe a las 11:30 p.m."],
  ["2026-09-22T03:00", "2026-09-22T08:00", "madrugada: espera a las 8 del mismo día"],
  ["2026-09-22T06:00", "2026-09-22T08:00", "las 6 son tierra muerta (0/12 el 21 sep)"],
  ["2026-09-22T07:59", "2026-09-22T08:00", "un minuto antes de la franja"],
  // Cambio de mes, para que la aritmética de días no se rompa en el borde
  ["2026-09-30T22:00", "2026-10-01T08:00", "fin de mes: pasa al día siguiente"],
];

let fallos = 0;
for (const [entrada, esperado, porque] of casos) {
  const real = nextSendableAt(ec(entrada));
  const ok = real.getTime() === ec(esperado).getTime();
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${entrada.slice(11)} → ${hhmm(real).slice(-5)}  · ${porque}`);
  if (!ok) console.log(`   esperaba ${hhmm(ec(esperado))}, obtuvo ${hhmm(real)}`);
}

// La franja se razona en hora de Ecuador, no en la del servidor (Vercel corre en UTC).
const medianocheUTC = new Date("2026-09-22T00:00:00Z"); // = 19:00 del 21 en Ecuador
const salida = nextSendableAt(medianocheUTC);
const okTz = salida.getTime() === medianocheUTC.getTime();
if (!okTz) fallos++;
console.log(`${okTz ? "✅" : "❌"} medianoche UTC = 19:00 EC → sale ya (no se confunde con la hora del servidor)`);

// ── Cadencia de no respuesta ────────────────────────────────────────────────
// Lo que protege: que los dos toques gratis caigan DENTRO de la ventana de 24 h
// y en horario humano, y que los de plantilla respeten la franja.
console.log("\nCadencia de no respuesta (el lead escribe y respondemos al instante):");
const cadencia: Array<[string, string | null, string | null, string, string]> = [
  // [último mensaje del lead = nuestra respuesta, toque 1, toque 2, día 3, por qué]
  ["2026-10-13T10:00", "2026-10-13T13:00", "2026-10-14T08:00", "2026-10-16T10:00", "media mañana: +3 h y a las 8 del día siguiente"],
  ["2026-10-13T19:30", "2026-10-14T08:00", "2026-10-14T17:30", "2026-10-16T19:30", "noche: el +3 h espera a las 8"],
  ["2026-10-13T06:30", "2026-10-13T09:30", "2026-10-13T20:30", "2026-10-16T08:00", "madrugada: el segundo se adelanta a las 20:30 para no perder la ventana"],
  ["2026-10-13T23:00", "2026-10-14T08:00", "2026-10-14T20:30", "2026-10-17T08:00", "muy tarde: el segundo no sale a las 21:00, sale 20:30"],
  ["2026-10-13T22:50", "2026-10-14T08:00", "2026-10-14T20:50", "2026-10-17T08:00", "22:50: el segundo cabe a las 20:50"],
];
for (const [cuando, t1, t2, d3, porque] of cadencia) {
  const r = noReplyTimes(ec(cuando), ec(cuando));
  const same = (a: Date | null, b: string | null) => (a === null ? b === null : b !== null && a.getTime() === ec(b).getTime());
  const ok = same(r.first, t1) && same(r.second, t2) && same(r.templates[3], d3);
  if (!ok) fallos++;
  const f = (d: Date | null) => (d ? hhmm(d) : "—");
  console.log(`${ok ? "✅" : "❌"} ${cuando.slice(11)} → ${f(r.first)} · ${f(r.second)} · día 3 ${f(r.templates[3])}  · ${porque}`);
}
// Sin mensaje del lead no hay ventana: no hay toques gratis.
const sinVentana = noReplyTimes(ec("2026-10-13T10:00"), null);
const okSin = sinVentana.first === null && sinVentana.second === null;
if (!okSin) fallos++;
console.log(`${okSin ? "✅" : "❌"} sin mensaje del lead: ningún toque de texto libre`);
// Respondimos casi al cierre de la ventana: los toques gratis ya no caben.
const tarde = noReplyTimes(ec("2026-10-14T09:00"), ec("2026-10-13T10:00"));
const okTarde = tarde.first === null && tarde.second === null;
if (!okTarde) fallos++;
console.log(`${okTarde ? "✅" : "❌"} respuesta a 23 h del lead: no se manda texto libre fuera de la ventana`);

console.log(fallos === 0 ? "\n✅ Todo correcto (franja de envío y cadencia)" : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
