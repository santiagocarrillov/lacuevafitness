// Pure helpers for the nutritionist agenda — no Prisma, no "use server", so they
// can be shared by server actions, the cron, client components and tests.

import { ecuadorDateString, ecuadorParts, ECUADOR_TZ } from "@/lib/timezone";

export type AppointmentKind = "INITIAL" | "FOLLOW_UP" | "OTHER";
export type AppointmentStatus = "SCHEDULED" | "ATTENDED" | "NO_SHOW" | "CANCELLED";

export const APPOINTMENT_KIND_LABEL: Record<AppointmentKind, string> = {
  INITIAL: "Primera consulta",
  FOLLOW_UP: "Control",
  OTHER: "Otra",
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendada",
  ATTENDED: "Atendido",
  NO_SHOW: "No vino",
  CANCELLED: "Cancelada",
};

/** Days without an attended consult before a member counts as "due" — one SRXFit cycle. */
export const COVERAGE_OVERDUE_DAYS = 63;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" + "HH:MM" in Ecuador time → UTC Date (Ecuador is UTC-5, no DST). */
export function ecuadorLocalToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) {
    throw new Error("Fecha u hora inválida.");
  }
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm, 0, 0));
}

/** "HH:MM" of a Date in Ecuador time. */
export function ecuadorTimeString(d: Date): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: ECUADOR_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** UTC bounds [start, end) of the Ecuador-local days from `from` to `to` inclusive ("YYYY-MM-DD"). */
export function ecuadorDayRange(from: string, to: string): { start: Date; end: Date } {
  const start = ecuadorLocalToUtc(from, "00:00");
  const end = new Date(ecuadorLocalToUtc(to, "00:00").getTime() + DAY_MS);
  return { start, end };
}

/** Add `days` to a "YYYY-MM-DD" string (calendar math, timezone-free). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `date` ("YYYY-MM-DD"). */
export function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** "jueves 2 de octubre, 10:00" — for pushes and the portal card. */
export function formatAppointmentWhen(d: Date): string {
  const day = new Intl.DateTimeFormat("es-EC", {
    timeZone: ECUADOR_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  return `${day}, ${ecuadorTimeString(d)}`;
}

type RemindCandidate = {
  id: string;
  startsAt: Date;
  status: AppointmentStatus;
  reminderSentAt: Date | null;
};

/**
 * Which appointments get the "tu cita es mañana" push when the daily cron runs
 * at `now`: still SCHEDULED, not reminded yet, and on the Ecuador-local day
 * after `now`'s. Appointments booked for today already got the booking push.
 */
export function selectAppointmentsToRemind<T extends RemindCandidate>(appts: T[], now: Date): T[] {
  const tomorrow = addDays(ecuadorDateString(now), 1);
  return appts.filter(
    (a) =>
      a.status === "SCHEDULED" &&
      a.reminderSentAt === null &&
      ecuadorDateString(a.startsAt) === tomorrow,
  );
}

export type CoverageState = "never" | "overdue" | "scheduled" | "ok";

export const COVERAGE_LABEL: Record<CoverageState, string> = {
  never: "Nunca atendido",
  overdue: "Toca control",
  scheduled: "Con cita",
  ok: "Al día",
};

/**
 * Coverage bucket for one member. An upcoming appointment wins (someone already
 * took care of it); otherwise never-seen, then overdue after one SRXFit cycle.
 */
export function coverageState(
  lastAttended: Date | null,
  nextScheduled: Date | null,
  now: Date,
): CoverageState {
  if (nextScheduled) return "scheduled";
  if (!lastAttended) return "never";
  const days = (now.getTime() - lastAttended.getTime()) / DAY_MS;
  return days > COVERAGE_OVERDUE_DAYS ? "overdue" : "ok";
}

/** Whole days between `d` and `now` (Ecuador calendar days). */
export function daysSince(d: Date, now: Date): number {
  const a = ecuadorParts(d);
  const b = ecuadorParts(now);
  const ua = Date.UTC(a.year, a.month - 1, a.day);
  const ub = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((ub - ua) / DAY_MS);
}
