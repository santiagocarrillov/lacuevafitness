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
import { nextSendableAt } from "../src/lib/whatsapp/sequences";

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

console.log(fallos === 0 ? "\n✅ Todo correcto (franja de envío)" : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
