/**
 * Feriado de Difuntos / Cuenca 2026 (holidays.ts), sin tocar la base ni el modelo:
 *
 *  1. No se agendan primeras sesiones el lunes 2 ni el martes 3; desde el
 *     viernes 30 los días agendables saltan al miércoles 4.
 *  2. Los agentes leen el horario reducido (y solo en los días cercanos).
 *  3. Los feriados no cuentan como sesiones perdidas ni como días sin venir.
 *  4. Los toques de la prueba no salen en feriado y su recuperación se estira.
 *  5. Los seguimientos a leads esperan al miércoles 4 a las 8:00.
 *
 * Uso:  npm run test:feriados
 */

import { bookableDays, bookingDaysContext, bookingProblem } from "../src/lib/whatsapp/booking";
import { sedeSlots24h, memberContextBlock } from "../src/lib/whatsapp/agent";
import { holidayContext, holidaysBetween } from "../src/lib/holidays";
import { missedSessions } from "../src/lib/whatsapp/absence-rhythm";
import { trainingDaysBetween } from "../src/lib/whatsapp/member-notices";
import { trialTouch } from "../src/lib/whatsapp/trial-touches";
import { nextSendableAt, waitsForSendWindow } from "../src/lib/whatsapp/sequences";

let fallos = 0;
function check(nombre: string, ok: boolean) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
}

const ec = (s: string) => new Date(`${s}:00-05:00`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ── 1. Agenda ──────────────────────────────────────────────────────────────
check("viernes 30 → viernes 30, miércoles 4, jueves 5", bookableDays(ec("2026-10-30T10:00")).map(ymd).join(",") === "2026-10-30,2026-11-04,2026-11-05");
check("lunes 2 → miércoles 4, jueves 5, viernes 6", bookableDays(ec("2026-11-02T09:00")).map(ymd).join(",") === "2026-11-04,2026-11-05,2026-11-06");
check("miércoles 28 sigue normal (28, 29, 30)", bookableDays(ec("2026-10-28T10:00")).map(ymd).join(",") === "2026-10-28,2026-10-29,2026-10-30");
const fitness = sedeSlots24h("FITNESS_CENTER");
const p = bookingProblem("2026-11-02T06:30:00-05:00", fitness, ec("2026-10-30T10:00"));
check("cita el lunes 2 6:30 se rechaza y dice feriado", !!p && p.includes("feriado"));
check("cita el miércoles 4 6:30 pasa", bookingProblem("2026-11-04T06:30:00-05:00", fitness, ec("2026-10-30T10:00")) === null);
check("calendario del sábado 31 marca el lunes como feriado", bookingDaysContext(ec("2026-10-31T09:00")).includes("pasado mañana = lunes 2 de noviembre (feriado de Difuntos"));

// ── 2. Contexto de los agentes ─────────────────────────────────────────────
const ventas = holidayContext("2026-10-28", ["FITNESS_CENTER", "XTREME"], { sales: true });
check("ventas ve Fitness 6:30 y 7:30 y Xtreme 7:00 y 8:00", ventas.includes("La Cueva Fitness 6:30 y 7:30 am") && ventas.includes("La Cueva Xtreme 7:00 y 8:00 am"));
check("ventas: no agendar en feriado", ventas.includes("NO agendes primeras sesiones"));
check("sin feriado cerca no hay sección", holidayContext("2026-11-10", ["XTREME"], { sales: true }) === "");
const socio = memberContextBlock({ firstName: "Ana", sede: "XTREME", daysSinceLastVisit: 2, rhythm: null }, ec("2026-10-29T12:00"));
check("el agente de socios ve el horario de Xtreme y no el de Fitness", socio.includes("La Cueva Xtreme 7:00 y 8:00 am") && !socio.includes("Fitness 6:30"));

// ── 3. Ausencias ───────────────────────────────────────────────────────────
check("feriados entre jueves 29 y miércoles 4: 3", holidaysBetween("2026-10-29", "2026-11-04") === 3);
check("días sin venir del jueves 29 al miércoles 4: 2 (viernes y miércoles)", trainingDaysBetween("2026-10-29", "2026-11-04") === 2);
const diario = { kind: "PATTERN" as const, perWeek: 5, days: [1, 2, 3, 4, 5] };
check("socio diario que vino el viernes 30: el miércoles 4 lleva 0 perdidas", missedSessions(diario, "2026-10-30", "2026-11-04") === 0);
check("…y el jueves 5 lleva 1 (el miércoles)", missedSessions(diario, "2026-10-30", "2026-11-05") === 1);

// ── 4. Prueba de $9 ────────────────────────────────────────────────────────
check("nada sale el lunes 2", trialTouch("2026-10-27", "2026-11-12", "2026-11-02") === null);
// Empezó el lunes 26: el día 7 es el domingo 1; feriados 31, 2, 3 → el miércoles 4 aún alcanza.
check("día 7 caído en el feriado se recupera el miércoles 4", trialTouch("2026-10-26", "2026-11-11", "2026-11-04") === "PRUEBA_DIA7");

// ── 5. Seguimientos ────────────────────────────────────────────────────────
check("un toque del sábado 31 a las 10:00 espera al miércoles 4 8:00", nextSendableAt(ec("2026-10-31T10:00")).getTime() === ec("2026-11-04T08:00").getTime());
check("del viernes 30 a las 22:00 → miércoles 4 8:00", nextSendableAt(ec("2026-10-30T22:00")).getTime() === ec("2026-11-04T08:00").getTime());
check("viernes 30 a las 10:00 sale ya", nextSendableAt(ec("2026-10-30T10:00")).getTime() === ec("2026-10-30T10:00").getTime());
check("el recordatorio de 1 h no espera (no hay citas en feriado)", !waitsForSendWindow("TRIAL_REMINDER_1H", ec("2026-11-02T10:00")));
check("un reenganche del lunes 2 espera", waitsForSendWindow("NO_REPLY_1D", ec("2026-11-02T10:00")));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
