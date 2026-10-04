// Server-only data loader for the attendance week calendar
// (/dashboard/asistencia?vista=calendario). Deliberately NOT a "use server"
// module: it is imported by the server component, never exposed as an action.
// The caller passes the already-authenticated user; we re-check role + sede
// scope here so the loader can't leak data if reused elsewhere.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSedeScope } from "@/lib/auth";
import { ecuadorParts, ecuadorTimeOfDayMinutes } from "@/lib/timezone";
import type { Sede, User } from "@/generated/prisma/client";

export type CalendarSedeFilter = Sede | "AMBAS";

export type CalendarAttendee = {
  memberId: string;
  firstName: string;
  lastName: string;
};

export type CalendarSession = {
  id: string;
  sede: Sede;
  name: string;
  /** 0 = Monday … 6 = Sunday. */
  dayIndex: number;
  /** Minutes since 00:00 Ecuador time. */
  startMin: number;
  durationMin: number;
  coachName: string | null;
  attendees: CalendarAttendee[];
};

export type CalendarWeek = {
  /** "YYYY-MM-DD" of the Monday. */
  monday: string;
  /** "YYYY-MM-DD" for each day Mon..Sun. */
  days: string[];
  sessions: CalendarSession[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UTC-midnight Date for today's Ecuador-local date. */
function ecuadorTodayUtc(): Date {
  const { year, month, day } = ecuadorParts();
  return new Date(Date.UTC(year, month - 1, day));
}

/** Monday (UTC-midnight) of the week containing `dayUtc`. */
function mondayOf(dayUtc: Date): Date {
  const offset = (dayUtc.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(dayUtc.getTime() - offset * DAY_MS);
}

/**
 * Resolve the `semana` search param ("YYYY-MM-DD", any day of the week) to the
 * Monday of that week. Falls back to the current Ecuador week when missing or
 * malformed.
 */
export function resolveWeekMonday(semana: string | undefined): Date {
  if (semana && /^\d{4}-\d{2}-\d{2}$/.test(semana)) {
    const [y, m, d] = semana.split("-").map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getUTCFullYear() === y &&
      parsed.getUTCMonth() === m - 1 &&
      parsed.getUTCDate() === d
    ) {
      return mondayOf(parsed);
    }
  }
  return mondayOf(ecuadorTodayUtc());
}

export function shiftWeek(monday: Date, weeks: number): string {
  return isoDay(new Date(monday.getTime() + weeks * 7 * DAY_MS));
}

export function currentWeekMonday(): string {
  return isoDay(mondayOf(ecuadorTodayUtc()));
}

export function ecuadorTodayIso(): string {
  return isoDay(ecuadorTodayUtc());
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "29 sep – 4 oct 2026", "5 – 10 oct 2026", "29 dic 2026 – 3 ene 2027". */
export function weekRangeLabel(monday: Date, dayCount: number): string {
  const end = new Date(monday.getTime() + (dayCount - 1) * DAY_MS);
  const sd = monday.getUTCDate();
  const sm = monday.getUTCMonth();
  const sy = monday.getUTCFullYear();
  const ed = end.getUTCDate();
  const em = end.getUTCMonth();
  const ey = end.getUTCFullYear();
  if (sy !== ey) return `${sd} ${MONTHS_ES[sm]} ${sy} – ${ed} ${MONTHS_ES[em]} ${ey}`;
  if (sm !== em) return `${sd} ${MONTHS_ES[sm]} – ${ed} ${MONTHS_ES[em]} ${ey}`;
  return `${sd} – ${ed} ${MONTHS_ES[em]} ${ey}`;
}

/**
 * Which sedes the user may see given the requested filter. Scoped users
 * (admins) are pinned to their own sede regardless of the URL.
 */
export function resolveSedeFilter(user: User, requested: string | undefined): CalendarSedeFilter {
  const scope = getSedeScope(user);
  if (scope) return scope;
  if (requested === "FITNESS_CENTER" || requested === "XTREME") return requested;
  return "AMBAS";
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * One query for the whole week: sessions + schedule + coach + attendance with
 * the member's id and name. Same visibility as the asistencia page: any staff
 * role, limited to the user's sede scope.
 */
export async function loadAttendanceWeek(
  user: User,
  monday: Date,
  filter: CalendarSedeFilter,
): Promise<CalendarWeek> {
  if (user.role === "MEMBER") redirect("/portal/hoy");

  // Enforce scope even if a caller passes a broader filter.
  const scope = getSedeScope(user);
  const sedes: Sede[] = scope
    ? [scope]
    : filter === "AMBAS"
      ? ["FITNESS_CENTER", "XTREME"]
      : [filter];

  const end = new Date(monday.getTime() + 7 * DAY_MS);

  const rows = await prisma.classSession.findMany({
    where: { date: { gte: monday, lt: end }, sede: { in: sedes } },
    orderBy: [{ date: "asc" }, { startAt: "asc" }],
    select: {
      id: true,
      sede: true,
      date: true,
      startAt: true,
      schedule: { select: { name: true, startTime: true, durationMin: true } },
      coach: { select: { fullName: true } },
      coachConfirmation: { select: { coach: { select: { fullName: true } } } },
      attendance: {
        select: { member: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  });

  const sessions: CalendarSession[] = rows.map((r) => {
    const startMin =
      (r.schedule ? parseHHMM(r.schedule.startTime) : null) ?? ecuadorTimeOfDayMinutes(r.startAt);
    const attendees = r.attendance
      .map((a) => ({
        memberId: a.member.id,
        firstName: a.member.firstName,
        lastName: a.member.lastName,
      }))
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es"),
      );
    return {
      id: r.id,
      sede: r.sede,
      name: r.schedule?.name ?? "Clase",
      dayIndex: (r.date.getUTCDay() + 6) % 7,
      startMin,
      durationMin: Math.max(15, r.schedule?.durationMin ?? 60),
      coachName: r.coach?.fullName ?? r.coachConfirmation?.coach.fullName ?? null,
      attendees,
    };
  });

  const days = Array.from({ length: 7 }, (_, i) => isoDay(new Date(monday.getTime() + i * DAY_MS)));
  return { monday: isoDay(monday), days, sessions };
}
