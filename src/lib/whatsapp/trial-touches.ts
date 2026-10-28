// The $9 trial, from the first session to the close (plan Fase 2, 20 oct 2026).
// Pure: calendar days in, decision out — scripts/test-prueba.ts covers it
// without the DB. The sending lives in member-notices.ts (avisos PRUEBA_*), and
// agent-runner.ts uses trialAgentContext() so the sales agent knows who is
// already inside their two weeks.
//
// Why: 35 % of those who finish the trial buy a plan, the best step of the
// funnel, and nobody wrote to them between the first session and the staff
// task at the end. In the 75 days to 19 oct, 10 of 53 trials came only once.
//
//   day 3   PRUEBA_DIA3    check-in: how did it feel, anything in the way?
//   day 7   PRUEBA_DIA7    halfway: sessions so far, aim for 3 a week
//   end-3   PRUEBA_CIERRE  close: sit with the coach, see results, pick a plan
//                          (end-2 if end-3 was missed; never closer to the end)
//
// Day 1 is the day the trial membership starts. Each touch has a short window
// (a missed cron or a Sunday catches up the next day) and only the latest one
// due is sent, so a trial loaded late never gets two at once.

import { addDays } from "@/lib/nutrition/appointments";
import { weekdayOf } from "@/lib/nutrition/slots";
import { holidaysBetween, isHoliday } from "@/lib/holidays";

export type TrialTouchKind = "PRUEBA_DIA3" | "PRUEBA_DIA7" | "PRUEBA_CIERRE";

/**
 * The close goes 3 days before the end, or 2 if that day was a Sunday or the
 * cron missed it. Closer than that, "before that date" no longer reads right:
 * the staff's trialclose task (tasks/auto.ts) covers the last days in person.
 */
const CLOSE_FROM_DAYS_LEFT = 3;
const CLOSE_UNTIL_DAYS_LEFT = 2;
/** How many days after its day a check-in can still catch up (Sunday, a missed cron). */
const CATCH_UP_DAYS = 2;

export type TrialDay = {
  /** 1 on the day the trial starts. */
  dayN: number;
  /** Calendar days from today to the end day (0 = it ends today). */
  daysLeft: number;
  /** Length of the trial in days (usually 14). */
  totalDays: number;
};

/** Calendar days from a to b ("YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export function trialDay(startDay: string, endDay: string, today: string): TrialDay {
  return { dayN: daysBetween(startDay, today) + 1, daysLeft: daysBetween(today, endDay), totalDays: daysBetween(startDay, endDay) };
}

/**
 * Which touch is due today for a trial running startDay → endDay, or null.
 * Nothing on Sundays (the gym is closed; Monday catches up), on holidays
 * (holidays.ts; the catch-up grows by them) nor once it ended.
 */
export function trialTouch(startDay: string, endDay: string, today: string): TrialTouchKind | null {
  if (weekdayOf(today) === 7 || isHoliday(today)) return null;
  const { dayN, daysLeft } = trialDay(startDay, endDay, today);
  if (dayN < 1 || daysLeft < CLOSE_UNTIL_DAYS_LEFT) return null;
  if (daysLeft <= CLOSE_FROM_DAYS_LEFT) return "PRUEBA_CIERRE";
  // Holidays from the touch's day (included) to today stretch its catch-up.
  const catchUp = (n: number) => CATCH_UP_DAYS + holidaysBetween(addDays(startDay, n - 2), today);
  if (dayN >= 7 && dayN <= 7 + catchUp(7)) return "PRUEBA_DIA7";
  if (dayN >= 3 && dayN <= 3 + catchUp(3)) return "PRUEBA_DIA3";
  return null;
}

/** "jueves 23 de octubre" for a "YYYY-MM-DD". */
export function longDay(ymd: string): string {
  return new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${ymd}T12:00:00Z`))
    .replace(",", "");
}

/** Price ladder for the close; same numbers as MONTHLY_PRICE_LADDER (tasks/auto.ts) and the prompt. */
export const CLOSE_PRICES = { list: 60, close: 50, debitPrepay: 40 } as const;

/**
 * What the sales agent must know when someone inside their trial writes.
 *
 * Without it the agent saw a lead in "En evaluación" and nothing else: it could
 * pitch the $9 again or book a "first session" to someone on day 9.
 */
export function trialAgentContext(t: { startDay: string; endDay: string; today: string; visits: number }): string {
  const { dayN, daysLeft, totalDays } = trialDay(t.startDay, t.endDay, t.today);
  const { list, close, debitPrepay } = CLOSE_PRICES;
  const closing = daysLeft <= CLOSE_FROM_DAYS_LEFT + 1;
  const when = daysLeft <= 0 ? "terminan HOY" : daysLeft === 1 ? "terminan mañana" : `terminan el ${longDay(t.endDay)} (faltan ${daysLeft} días)`;
  return [
    `# Esta persona YA está en sus dos semanas de evaluación`,
    `Va por el día ${Math.min(dayN, totalDays)} de ${totalDays}; sus dos semanas ${when}. Entrenamientos registrados desde que empezó: ${t.visits}.`,
    `NO le ofrezcas las dos semanas por $9, NO le expliques el método desde cero y NO agendes "primera sesión": ya entrena con nosotros, deja scheduledAtISO en null.`,
    `Tu trabajo: que viva bien su prueba y que venga al menos 3 veces por semana (si viene poco, pregunta qué se lo impide y ofrece un horario concreto). Si cuenta una molestia o dolor, que lo hable con su coach antes de entrenar; si es una lesión, handoff.`,
    closing
      ? `Estamos en el CIERRE: invítale a sentarse 10 minutos con su coach para ver sus resultados y elegir su plan, con un día concreto ("¿te queda mañana a las 18:00 o el jueves?"). Precio solo si pregunta o duda: mensualidad $${list}; al inscribirse al terminar la prueba queda en $${close} mes a mes, y desde $${debitPrepay} con débito automático y prepago (trimestral, semestral o anual). Para pagar o inscribirse: en la recepción de su sede; si quiere pagar ya por transferencia o pide datos de pago, handoff.`
      : `Si pregunta qué pasa al terminar: al final se sienta con su coach a ver sus resultados y elige su plan; precio solo si pregunta (mensualidad $${list}, desde $${debitPrepay} hasta $${close} según el compromiso de pago).`,
  ].join("\n");
}
