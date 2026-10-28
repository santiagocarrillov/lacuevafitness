// Holidays: days with a reduced schedule (only a couple of morning classes, for
// socios). Pure — scripts/test-feriados.ts covers it without the DB.
//
// Feriado de Difuntos / Independencia de Cuenca 2026 (Santiago, 28 oct 2026):
// Saturday 31 oct, Monday 2 and Tuesday 3 nov, two morning classes per sede.
// Sunday 1 nov is a Sunday (closed as always). On these days:
//   - the sales agent books no first sessions and knows the reduced hours;
//   - the socio agent knows the reduced hours;
//   - automatic notices (absence, frequency, trial check-ins…) don't go out,
//     and the days don't count as missed sessions or days without coming;
//   - no-reply nudges and re-engagement templates to leads wait until the next
//     normal day at 8:00.
// Add the next holiday here; nothing else has to change.

import type { Sede } from "@/generated/prisma/client";

export type Holiday = {
  /** Ecuador calendar day, "YYYY-MM-DD". */
  day: string;
  /** How the agent names it to a lead or socio. */
  name: string;
  /** Class start times per sede, "HH:MM" 24 h. */
  slots: Record<Sede, string[]>;
};

const DIFUNTOS_2026: Record<Sede, string[]> = {
  FITNESS_CENTER: ["06:30", "07:30"],
  XTREME: ["07:00", "08:00"],
};

export const HOLIDAYS: Holiday[] = [
  { day: "2026-10-31", name: "fin de semana largo de Difuntos", slots: DIFUNTOS_2026 },
  { day: "2026-11-02", name: "feriado de Difuntos", slots: DIFUNTOS_2026 },
  { day: "2026-11-03", name: "feriado de Independencia de Cuenca", slots: DIFUNTOS_2026 },
];

export function holidayOn(day: string): Holiday | null {
  return HOLIDAYS.find((h) => h.day === day) ?? null;
}

export const isHoliday = (day: string) => holidayOn(day) !== null;

const DAY_MS = 86_400_000;
const addDay = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * A holiday, or the Sunday in the middle of a long weekend (sábado 31 – martes 3):
 * nobody is around to answer a lead or a notice, so nothing promotional goes out.
 */
export function isOffDay(day: string): boolean {
  if (isHoliday(day)) return true;
  const isSunday = new Date(`${day}T12:00:00Z`).getUTCDay() === 0;
  return isSunday && isHoliday(addDay(day, -1)) && isHoliday(addDay(day, 1));
}

/** Holidays strictly after `from` and up to `to` (both "YYYY-MM-DD"). */
export function holidaysBetween(from: string, to: string): number {
  return HOLIDAYS.filter((h) => h.day > from && h.day <= to).length;
}

/** "6:30 y 7:30" from ["06:30", "07:30"]. */
const spoken = (slots: string[]) => slots.map((s) => s.replace(/^0/, "")).join(" y ");

const WEEKDAY_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const label = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return `${WEEKDAY_ES[d.getUTCDay()]} ${d.getUTCDate()}`;
};

/**
 * The lines an agent reads about holidays in the next `aheadDays` days (today
 * included), or "" when there are none. `sedes`: whose hours to list.
 */
export function holidayContext(today: string, sedes: Sede[], opts: { sales: boolean; aheadDays?: number }): string {
  const until = addDay(today, opts.aheadDays ?? 7);
  const coming = HOLIDAYS.filter((h) => h.day >= today && h.day <= until);
  if (!coming.length) return "";
  const names: Record<Sede, string> = { FITNESS_CENTER: "La Cueva Fitness", XTREME: "La Cueva Xtreme" };
  const lines = coming.map(
    (h) => `- ${label(h.day)} (${h.name}): solo ${sedes.map((s) => `${names[s]} ${spoken(h.slots[s])} am`).join(" · ")}.`,
  );
  return [
    `# Feriado: horario reducido`,
    ...lines,
    `Esos días solo hay esas clases de la mañana, para socios; en la tarde no hay clases.`,
    opts.sales
      ? `NO agendes primeras sesiones en esos días: ofrece el siguiente día normal (desde el miércoles 4). Si el lead quiere empezar, dile con calidez que retomamos con todo el miércoles y deja la cita para ese día o después.`
      : `Si el socio pregunta por el horario de esos días, dáselo tal cual. Si dice que se va de viaje, deséale buen feriado y pregúntale qué día vuelve.`,
  ].join("\n");
}
