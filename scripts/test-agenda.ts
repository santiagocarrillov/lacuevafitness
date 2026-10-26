/**
 * Prueba de los arreglos de la revisión del bot del 26 oct 2026, sin tocar la
 * base ni el modelo, con los casos reales:
 *
 *  1. Días agendables: nunca sábado ni domingo, y "mañana" desde un viernes es
 *     el sábado (Rousibell quedó agendada el sábado 24 a las 17:30).
 *  2. La cita que devuelve el agente se valida: día agendable y turno real de
 *     la sede (Pablo: 17:30 en Xtreme no existe).
 *  3. El mensaje casi idéntico al anterior se detecta (Rousibell recibió cuatro
 *     veces la misma confirmación) sin confundir respuestas distintas.
 *  4. Los seguimientos esperan la franja 08–21 (salieron 8 a las 00:00 del lunes
 *     26) y el recordatorio de 24 h no sale el mismo día de la cita.
 *
 * Uso:  npm run test:agenda
 */

import "dotenv/config";
import { bookableDays, bookingDaysContext, bookingProblem } from "../src/lib/whatsapp/booking";
import { repeatsLastReply } from "../src/lib/whatsapp/guards";
import { sedeSlots24h } from "../src/lib/whatsapp/agent";
import { draftIssue } from "../src/lib/whatsapp/agent-runner";
import { dayReminderIsLate, waitsForSendWindow } from "../src/lib/whatsapp/sequences";

let fallos = 0;
function check(nombre: string, ok: boolean) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
}

/** An Ecuador wall-clock time as a Date ("2026-10-23T16:57" → UTC-5). */
const ec = (s: string) => new Date(`${s}:00-05:00`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

const xtreme = sedeSlots24h("XTREME");
const fitness = sedeSlots24h("FITNESS_CENTER");

// ── 1. Días agendables ─────────────────────────────────────────────────────
const viernes = ec("2026-10-23T16:57");
check("viernes → viernes, lunes, martes", bookableDays(viernes).map(ymd).join(",") === "2026-10-23,2026-10-26,2026-10-27");
const sabado = ec("2026-10-24T23:29");
check("sábado → lunes, martes, miércoles", bookableDays(sabado).map(ymd).join(",") === "2026-10-26,2026-10-27,2026-10-28");
const domingoNoche = ec("2026-10-25T20:44");
check("domingo → lunes, martes, miércoles", bookableDays(domingoNoche).map(ymd).join(",") === "2026-10-26,2026-10-27,2026-10-28");
const ctxViernes = bookingDaysContext(viernes);
check("el contexto del viernes dice que mañana es sábado", ctxViernes.includes("mañana = sábado 24 de octubre (sábado"));
check("el contexto del viernes marca el domingo cerrado", ctxViernes.includes("pasado mañana = domingo 25 de octubre (domingo: el gimnasio está cerrado)"));
check("el contexto lista el lunes 26 como agendable", ctxViernes.includes("lunes 26 de octubre (2026-10-26)"));
// 19:30 (UTC 00:30 del día siguiente): el día sigue siendo el de Ecuador.
check("de noche no se salta al día UTC", bookableDays(ec("2026-10-22T22:30")).map(ymd)[0] === "2026-10-22");

// ── 2. Validar la cita ─────────────────────────────────────────────────────
check("Rousibell: sábado 17:30 se rechaza", bookingProblem("2026-10-24T17:30:00-05:00", fitness, viernes)?.includes("sábado") === true);
check("Jennifer: domingo 6:30 se rechaza", bookingProblem("2026-10-25T06:30:00-05:00", fitness, ec("2026-10-24T23:31"))?.includes("domingo") === true);
check("lunes 6:30 en Fitness pasa", bookingProblem("2026-10-26T06:30:00-05:00", fitness, viernes) === null);
check("Pablo: 17:30 en Xtreme no es un turno", bookingProblem("2026-10-26T17:30:00-05:00", xtreme, ec("2026-10-26T08:48"))?.includes("17:30") === true);
check("18:00 en Xtreme pasa", bookingProblem("2026-10-26T18:00:00-05:00", xtreme, ec("2026-10-26T08:49")) === null);
check("una hora que ya pasó se rechaza", bookingProblem("2026-10-26T07:00:00-05:00", xtreme, ec("2026-10-26T08:00")) !== null);
check("más allá de los días agendables se rechaza", bookingProblem("2026-10-29T07:00:00-05:00", xtreme, ec("2026-10-26T08:00"))?.includes("agendables") === true);
check("fecha basura se rechaza", bookingProblem("mañana", xtreme, viernes) !== null);
// La sede del lead manda cuando el agente no la nombra.
check(
  "draftIssue usa la sede del lead si el agente dice UNKNOWN",
  draftIssue({ reply: "ok", sede: "UNKNOWN", scheduledAtISO: "2026-10-26T17:30:00-05:00" }, { lastBotReply: null, fallbackSede: "XTREME", inTrial: false }, viernes)?.kind === "booking",
);
check(
  "draftIssue no valida citas dentro de la prueba",
  draftIssue({ reply: "ok", sede: "XTREME", scheduledAtISO: "2026-10-24T17:30:00-05:00" }, { lastBotReply: null, fallbackSede: null, inTrial: true }, viernes) === null,
);

// ── 3. El mismo mensaje otra vez ───────────────────────────────────────────
const confirma =
  "¡Listo, Rousibell! 🌹 Te dejo confirmada tu primera sesión mañana viernes a las 5:30 de la tarde en La Cueva Fitness 💪 Llega unos 15 min antes para recibirte con calma y arrancar bien tus dos semanas 🔥 ¡Y trae a tu amiga si se anima! Te espero 😊\n\n📍 La Cueva Fitness: https://maps.app.goo.gl/DPquYpZSwpKHcS9AA";
const confirma2 =
  "¡Listo, Rousibell! 🙌 Te dejo agendada tu primera sesión mañana viernes a las 5:30 de la tarde en La Cueva Fitness 💪 Llega unos 15 min antes para recibirte con calma y arrancar bien tus dos semanas 🔥 ¡Y si tu amiga se anima, tráela! 🌹 Te espero 😊";
const parqueo =
  "¡Sí, Rousibell! 🌹 La Cueva Fitness tiene dónde dejar el carro. Y la sesión dura una hora. ¡Te espero mañana viernes a las 5:30! 💪";
check("la misma confirmación se detecta", repeatsLastReply(confirma, confirma));
check("la confirmación casi igual se detecta", repeatsLastReply(confirma2, confirma.split("\n\n📍")[0]));
check("una respuesta a otra pregunta NO es repetición", !repeatsLastReply(parqueo, confirma));
check("mensajes cortos no cuentan", !repeatsLastReply("¡Nos vemos! 💪", "¡Nos vemos! 💪"));
check(
  "draftIssue ignora el mapa adjunto al comparar",
  draftIssue({ reply: confirma2, sede: "FITNESS_CENTER", scheduledAtISO: null }, { lastBotReply: confirma, fallbackSede: null, inTrial: false })?.kind === "repeat",
);

// ── 4. Franja de envío ─────────────────────────────────────────────────────
check("00:00 del lunes: el día 3 espera", waitsForSendWindow("NO_REPLY_3D", ec("2026-10-26T00:00")));
check("00:00: el de 24 h espera", waitsForSendWindow("TRIAL_REMINDER_24H", ec("2026-10-26T00:00")));
check("05:00: el de 1 h sale (clase de las 6:00)", !waitsForSendWindow("TRIAL_REMINDER_1H", ec("2026-10-26T05:00")));
check("10:00: el día 7 sale", !waitsForSendWindow("NOSHOW_RECOVERY_7D", ec("2026-10-26T10:00")));
check("21:00: ya espera", waitsForSendWindow("NO_REPLY_7D", ec("2026-10-25T21:00")));
check("Mayfe: el de 24 h el mismo día de la cita no sale", dayReminderIsLate(ec("2026-10-26T18:30"), ec("2026-10-26T08:00")));
check("el de 24 h la víspera sí sale", !dayReminderIsLate(ec("2026-10-26T18:30"), ec("2026-10-25T18:30")));
check("sin cita no se frena", !dayReminderIsLate(null, ec("2026-10-26T08:00")));

console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
