// Pure timezone helpers for Ecuador (America/Guayaquil = UTC-5, no DST).
// Server runs in UTC; we compute "today" and "now" in Ecuador local time.

export const ECUADOR_TZ = "America/Guayaquil";

export function ecuadorParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TZ,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  const wd = parts.find((p) => p.type === "weekday")!.value.slice(0, 3).toUpperCase();
  return { year, month, day, weekday: wd as "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" };
}

export function todayDateUtc(): Date {
  const { year, month, day } = ecuadorParts();
  return new Date(Date.UTC(year, month - 1, day));
}

export function todayDayOfWeekEcuador() {
  return ecuadorParts().weekday;
}

// Build a Date that represents `hours:minutes` in Ecuador time on the
// Ecuador-local date stored in `dayUtc` (a UTC-midnight Date).
export function ecuadorDateAt(dayUtc: Date, hours: number, minutes: number): Date {
  return new Date(Date.UTC(
    dayUtc.getUTCFullYear(),
    dayUtc.getUTCMonth(),
    dayUtc.getUTCDate(),
    hours + 5, minutes, 0, 0,
  ));
}

// Minutes since 00:00 Ecuador time.
export function ecuadorTimeOfDayMinutes(d: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TZ,
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return h * 60 + m;
}

// Attendance recording window: 00:00 → 21:30 Ecuador.
export const ATTENDANCE_CUTOFF_MIN = 21 * 60 + 30;

export function isAttendanceWindowOpen(d: Date = new Date()): boolean {
  return ecuadorTimeOfDayMinutes(d) <= ATTENDANCE_CUTOFF_MIN;
}
