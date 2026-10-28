// When a socio's absence is worth a WhatsApp (aviso AUSENCIA). Pure: calendar
// days in, decision out — scripts/test-ausencia.ts covers it without the DB.
//
// Rule decided by Santiago on 16 oct 2026: the trigger is **2 expected sessions
// missed, by each socio's own rhythm**, not "N days" for everybody. Two days
// without coming is normal for someone who trains L-M-V; for someone who comes
// every weekday it is already a missed habit.
//
// The rhythm comes from the 4 weeks that end on the last visit (while they were
// still coming — measuring the weeks before *today* would mix the absence into
// the rhythm):
//   - PATTERN: they have usual weekdays (a weekday attended in at least half of
//     the weeks) and most visits fall on them. Missed = usual days gone by ×
//     how often they show up on a usual day (1 for whoever comes on all of them;
//     ½ for someone who comes 1,5 a week spread over L-M-X).
//   - RATE: regular but without fixed days. Missed = training days gone by ×
//     their visits per training day.
//   - DEFAULT (floor for new socios, < 2 weeks of history): as if they came 3
//     times a week L–V, the target for everybody → 3 weekdays.
// Missed sessions are rounded: 1,8 expected sessions (an almost-daily socio
// after two weekdays) count as 2.
//   - LOW: under 1,5 visits a week. They weren't "coming often", so no absence
//     notice; FRECUENCIA and the 7/14-day staff tasks cover them.
//
// Only days that are over count: the cron runs at 10:00 and the evening classes
// are still ahead, so today is never a missed session.

import { addDays } from "@/lib/nutrition/appointments";
import { weekdayOf } from "@/lib/nutrition/slots";
import { isHoliday } from "@/lib/holidays";

export const RHYTHM_WEEKS = 4;
/** Fewer weeks of history than this and the rhythm is a guess: use DEFAULT. */
const MIN_HISTORY_DAYS = 14;
/** Under this many visits a week the socio wasn't "coming often". */
export const MIN_REGULAR_PER_WEEK = 1.5;
/** Missed sessions that trigger the notice. */
export const MISSED_TO_NOTIFY = 2;
/**
 * …and past this many it is no longer "just now": the notice goes at the 2nd
 * missed session (or the 3rd, if the cron skipped a day), never as a late
 * catch-up — that is the 7/14-day staff tasks' job.
 */
const MISSED_MAX = 3;
/** DEFAULT rhythm: the 3-a-week target, on weekdays. */
const DEFAULT_PER_WEEK = 3;
/** RATE never waits longer than this many training days (≈ a week). */
const RATE_MAX_GAP = 6;
/**
 * Past this many calendar days since the last visit the notice is stale (the
 * staff tasks of 7 and 14 days own it). Matters when the switch is turned on, or
 * the cron skipped days: nobody gets "te extrañamos" three weeks late.
 */
export const STALE_AFTER_DAYS = 10;

export type Rhythm =
  | { kind: "PATTERN"; perWeek: number; days: number[] }
  | { kind: "RATE"; perWeek: number; trainingDays: 5 | 6 }
  | { kind: "DEFAULT"; perWeek: number }
  | { kind: "LOW"; perWeek: number };

const WEEKDAY_SHORT = ["", "L", "M", "X", "J", "V", "S", "D"];

/** Calendar days from `from` to `to` ("YYYY-MM-DD"), positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/**
 * The socio's rhythm in the 4 weeks ending on their last visit.
 * `visitDays`: Ecuador calendar days with attendance (any order, repeats ok).
 * `joinedDay`: when they joined, so a socio of 10 days isn't read as "low".
 */
export function memberRhythm(visitDays: string[], joinedDay: string | null): Rhythm | null {
  const days = [...new Set(visitDays)].filter((d) => weekdayOf(d) !== 7).sort();
  if (!days.length) return null;
  const last = days[days.length - 1];
  const windowStart = addDays(last, -(RHYTHM_WEEKS * 7 - 1));
  const start = joinedDay && joinedDay > windowStart ? joinedDay : windowStart;
  const historyDays = daysBetween(start, last) + 1;
  if (historyDays < MIN_HISTORY_DAYS) return { kind: "DEFAULT", perWeek: DEFAULT_PER_WEEK };

  const inWindow = days.filter((d) => d >= start && d <= last);
  const weeks = historyDays / 7;
  const perWeek = Math.round((inWindow.length / weeks) * 10) / 10;
  if (perWeek < MIN_REGULAR_PER_WEEK) return { kind: "LOW", perWeek };

  // Usual weekdays: attended in at least half of the weeks of the window.
  const byWeekday = new Map<number, number>();
  for (const d of inWindow) byWeekday.set(weekdayOf(d), (byWeekday.get(weekdayOf(d)) ?? 0) + 1);
  const usual = [...byWeekday].filter(([, n]) => n >= Math.ceil(weeks / 2)).map(([w]) => w).sort();
  const onUsual = inWindow.filter((d) => usual.includes(weekdayOf(d))).length;
  if (usual.length && onUsual / inWindow.length >= 0.75) return { kind: "PATTERN", perWeek, days: usual };

  return { kind: "RATE", perWeek, trainingDays: inWindow.some((d) => weekdayOf(d) === 6) ? 6 : 5 };
}

/** Expected sessions missed between the last visit and today, both excluded (holidays don't count). */
export function missedSessions(rhythm: Rhythm, lastDay: string, today: string): number {
  if (rhythm.kind === "LOW") return 0;
  let usualDays = 0;
  let trainingDays = 0;
  const week = rhythm.kind === "RATE" ? rhythm.trainingDays : 5;
  for (let d = addDays(lastDay, 1); d < today; d = addDays(d, 1)) {
    if (isHoliday(d)) continue; // reduced schedule: not a session they were expected at
    const w = weekdayOf(d);
    if (rhythm.kind === "PATTERN" && rhythm.days.includes(w)) usualDays++;
    if (w <= week) trainingDays++;
  }
  if (rhythm.kind === "PATTERN") return Math.round(usualDays * Math.min(1, rhythm.perWeek / rhythm.days.length));
  // RATE / DEFAULT: their chance of coming on any training day, capped so the
  // irregular ones still hear from us within about a week.
  const expected = Math.round((trainingDays * rhythm.perWeek) / week);
  return trainingDays >= RATE_MAX_GAP ? Math.max(MISSED_TO_NOTIFY, expected) : expected;
}

export type AbsenceDecision = { due: boolean; missed: number; rhythm: Rhythm | null; why: string };

/** The whole rule: is today the day to send this socio the absence notice? */
export function absenceDecision(visitDays: string[], joinedDay: string | null, today: string): AbsenceDecision {
  const past = visitDays.filter((d) => d < today);
  if (visitDays.some((d) => d >= today)) return { due: false, missed: 0, rhythm: null, why: "vino hoy" };
  const rhythm = memberRhythm(past, joinedDay);
  if (!rhythm) return { due: false, missed: 0, rhythm: null, why: "sin asistencias" };
  const lastDay = [...past].sort().at(-1)!;
  const missed = missedSessions(rhythm, lastDay, today);
  const gone = daysBetween(lastDay, today);
  const why = `${describeRhythm(rhythm)}; última vez ${lastDay}; ${missed} ${missed === 1 ? "sesión perdida" : "sesiones perdidas"}`;
  if (rhythm.kind === "LOW") return { due: false, missed, rhythm, why };
  if (gone > STALE_AFTER_DAYS) return { due: false, missed, rhythm, why: `${why}; ya pasó a las tareas del staff` };
  if (missed > MISSED_MAX) return { due: false, missed, rhythm, why: `${why}; el aviso ya habría salido antes` };
  return { due: missed >= MISSED_TO_NOTIFY, missed, rhythm, why };
}

/** "L-X-V (3/sem)", "≈2,5/sem sin días fijos", "nuevo (3/sem por defecto)". */
export function describeRhythm(r: Rhythm): string {
  const pw = String(r.perWeek).replace(".", ",");
  if (r.kind === "PATTERN") return `${r.days.map((d) => WEEKDAY_SHORT[d]).join("-")} (${pw}/sem)`;
  if (r.kind === "RATE") return `≈${pw}/sem sin días fijos`;
  if (r.kind === "DEFAULT") return `nuevo (${pw}/sem por defecto)`;
  return `poco frecuente (${pw}/sem)`;
}
