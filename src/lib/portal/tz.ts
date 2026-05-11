// Ecuador (America/Guayaquil, UTC-5, no DST) date helpers.
// Server runs in UTC; the portal renders times in the member's local zone.

const ECUADOR_TZ = "America/Guayaquil";

export type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export function ecuadorParts(d: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ECUADOR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  const wd = parts
    .find((p) => p.type === "weekday")!
    .value.slice(0, 3)
    .toUpperCase() as Weekday;
  return { year, month, day, weekday: wd };
}

export function todayDayOfWeekEcuador(): Weekday {
  return ecuadorParts().weekday;
}

export function ecuadorHour(d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ECUADOR_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(d),
  );
}
