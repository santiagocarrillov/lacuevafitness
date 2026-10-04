// Open consultation slots (pure — no Prisma; shared by the dashboard, the
// portal, the public booking page /cita/[código] and the tests).
// A slot is free when it falls inside the nutritionist's weekly hours, is not
// in a time-off block, does not overlap a SCHEDULED appointment of the same
// person (in any sede — she can't be in two places) and is far enough ahead.

import { addDays, ecuadorLocalToUtc } from "@/lib/nutrition/appointments";

export type SedeKey = "FITNESS_CENTER" | "XTREME";

export type AvailabilityWindow = {
  staffUserId: string;
  sede: SedeKey;
  weekday: number; // 1 = lunes … 7 = domingo
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
};

export type BusyBlock = { staffUserId: string; startsAt: Date; durationMin: number };
export type TimeOffBlock = { staffUserId: string; startsAt: Date; endsAt: Date };

export type Slot = {
  startsAt: string; // ISO (UTC)
  time: string; // "HH:MM" Ecuador
  sede: SedeKey;
  staffUserId: string;
  durationMin: number;
};

export type SlotDay = { date: string; weekday: number; slots: Slot[] };

/** Members must book at least this far ahead (the nutritionist needs to see it). */
export const DEFAULT_LEAD_MINUTES = 120;

export const WEEKDAY_LABEL = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** 1 = Monday … 7 = Sunday, for a "YYYY-MM-DD" calendar day. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export const minuteToTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function timeToMinute(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) throw new Error("Hora inválida (usa HH:MM).");
  const v = Number(m[1]) * 60 + Number(m[2]);
  if (v < 0 || v > 24 * 60) throw new Error("Hora inválida.");
  return v;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

export function computeSlots(input: {
  windows: AvailabilityWindow[];
  busy: BusyBlock[];
  timeOff: TimeOffBlock[];
  fromDate: string; // first Ecuador day considered
  days: number;
  now: Date;
  leadMinutes?: number;
  sede?: SedeKey | null;
}): SlotDay[] {
  const earliest = input.now.getTime() + (input.leadMinutes ?? DEFAULT_LEAD_MINUTES) * 60_000;
  const out: SlotDay[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.fromDate, i);
    const weekday = weekdayOf(date);
    const slots: Slot[] = [];
    const seen = new Set<string>();
    for (const w of input.windows) {
      if (w.weekday !== weekday || (input.sede && w.sede !== input.sede) || w.slotMinutes < 10) continue;
      for (let m = w.startMinute; m + w.slotMinutes <= w.endMinute; m += w.slotMinutes) {
        const start = ecuadorLocalToUtc(date, minuteToTime(m));
        const s = start.getTime();
        const e = s + w.slotMinutes * 60_000;
        if (s < earliest) continue;
        const taken = input.busy.some(
          (b) => b.staffUserId === w.staffUserId && overlaps(s, e, b.startsAt.getTime(), b.startsAt.getTime() + b.durationMin * 60_000),
        );
        const off = input.timeOff.some((t) => t.staffUserId === w.staffUserId && overlaps(s, e, t.startsAt.getTime(), t.endsAt.getTime()));
        const key = `${w.staffUserId}|${s}`;
        if (taken || off || seen.has(key)) continue;
        seen.add(key);
        slots.push({ startsAt: start.toISOString(), time: minuteToTime(m), sede: w.sede, staffUserId: w.staffUserId, durationMin: w.slotMinutes });
      }
    }
    slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (slots.length) out.push({ date, weekday, slots });
  }
  return out;
}

/**
 * Last day a trial member should see the nutritionist: the day before the
 * trial ends, pulled back to Friday when it falls on a weekend.
 * `trialEnd` = "YYYY-MM-DD" (Ecuador) of Membership.endsAt.
 */
export function trialDeadline(trialEnd: string): string {
  const day = addDays(trialEnd, -1);
  const wd = weekdayOf(day);
  return wd === 6 ? addDays(day, -1) : wd === 7 ? addDays(day, -2) : day;
}

/** No measurement in two SRXFIT cycles → time to weigh and measure. */
export const MEASUREMENT_DUE_DAYS = 18 * 7;
/** …and it must happen before the third cycle is over. */
export const MEASUREMENT_DEADLINE_DAYS = 20 * 7;

/** Unambiguous booking code (no 0/O/1/l/I). */
export function bookingCode(random: (n: number) => number = (n) => Math.floor(Math.random() * n), length = 10): string {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[random(alphabet.length)];
  return out;
}
