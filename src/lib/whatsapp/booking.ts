/**
 * Which days the agent may book a first session on, and whether a booking it
 * returned is real. Pure (scripts/test-agenda.ts).
 *
 * Revisión del 26 oct 2026: the prompt only said "L–V" and banned Saturday, so
 * on a Saturday night the agent offered "mañana" (Sunday, closed) and its nudges
 * proposed Sunday too. Worse, on Friday 23 oct it wrote "mañana viernes" to
 * Rousibell and returned Saturday 17:30: the booking was saved for a day with no
 * first sessions, she got the reminder and then "vimos que no pudiste venir".
 * Now the context names the bookable days with their dates, and the runner
 * rejects any scheduledAtISO that isn't one of them at a real slot of the sede.
 */

import { ecuadorParts } from "@/lib/timezone";
import { holidayOn, isHoliday } from "@/lib/holidays";

const DAY_MS = 86_400_000;
const EC_OFFSET_MS = 5 * 60 * 60 * 1000;

/** First sessions are booked within this many weekdays, today included. */
export const BOOKABLE_WEEKDAYS = 3;

const WEEKDAY_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** A calendar day in Ecuador, as a UTC-midnight Date (weekday via getUTCDay). */
function ecuadorDay(d: Date): Date {
  const { year, month, day } = ecuadorParts(d);
  return new Date(Date.UTC(year, month - 1, day));
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const label = (d: Date) => `${WEEKDAY_ES[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTH_ES[d.getUTCMonth()]}`;
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/**
 * The next BOOKABLE_WEEKDAYS weekdays that aren't holidays (holidays.ts), starting today if today is one. Today is
 * listed even late in the evening: the slot check is what rules out a past hour.
 */
export function bookableDays(now: Date = new Date()): Date[] {
  const days: Date[] = [];
  for (let d = ecuadorDay(now); days.length < BOOKABLE_WEEKDAYS; d = new Date(d.getTime() + DAY_MS)) {
    if (!isWeekend(d) && !isHoliday(ymd(d))) days.push(d);
  }
  return days;
}

/**
 * The lines the agent reads about dates: what "hoy", "mañana" and "pasado
 * mañana" are, and on which days it may book. Spelled out because the model
 * resolved "mañana" from a Friday as Friday.
 */
export function bookingDaysContext(now: Date = new Date()): string {
  const today = ecuadorDay(now);
  const rel = ["hoy", "mañana", "pasado mañana"].map((word, i) => {
    const d = new Date(today.getTime() + i * DAY_MS);
    const holiday = holidayOn(ymd(d));
    const note = d.getUTCDay() === 0 ? " (domingo: el gimnasio está cerrado)" : holiday ? ` (${holiday.name}: horario reducido, no se agendan primeras sesiones)` : d.getUTCDay() === 6 ? " (sábado: no se agendan primeras sesiones)" : "";
    return `${word} = ${label(d)}${note}`;
  });
  const days = bookableDays(now).map((d) => `${label(d)} (${ymd(d)})`);
  return (
    `Calendario: ${rel.join("; ")}.\n` +
    `Días en que puedes agendar la primera sesión (solo estos): ${days.join(", ")}. ` +
    `Si el lead quiere otro día, no lo agendes: es posponer (contactarDesde). ` +
    `Al decir un día, di siempre el día de la semana que corresponde a esa fecha en este calendario.`
  );
}

/**
 * Why a booking the agent returned can't stand, in words the retry can use, or
 * null when it's fine. `slots` are the sede's start times as "HH:MM" (24 h).
 */
export function bookingProblem(iso: string, slots: string[], now: Date = new Date()): string | null {
  const when = new Date(iso);
  if (isNaN(when.getTime())) return `la fecha "${iso}" no es válida`;
  if (when.getTime() <= now.getTime()) return "agendaste una hora que ya pasó";

  const day = ecuadorDay(when);
  if (day.getUTCDay() === 0) return `agendaste el domingo ${day.getUTCDate()}, y el domingo el gimnasio está cerrado`;
  const holiday = holidayOn(ymd(day));
  if (holiday) return `agendaste el ${label(day)}, que es ${holiday.name}: solo hay clases de la mañana para socios y no se agendan primeras sesiones`;
  if (day.getUTCDay() === 6) return `agendaste el sábado ${day.getUTCDate()}, y los sábados no se agendan primeras sesiones`;
  if (!bookableDays(now).some((d) => d.getTime() === day.getTime())) {
    return `agendaste el ${label(day)}, que no está entre los días agendables`;
  }

  const local = new Date(when.getTime() - EC_OFFSET_MS);
  const hhmm = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  if (!slots.includes(hhmm)) return `a las ${hhmm} no empieza ninguna clase en esa sede`;
  return null;
}
