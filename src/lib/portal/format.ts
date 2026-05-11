// Spanish-locale formatting helpers for the portal.

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function shortDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function longDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const wd = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getDay()];
  return `${wd} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function money(cents: number, currency = "USD"): string {
  const v = (cents / 100).toFixed(2);
  return currency === "USD" ? `$${v}` : `${v} ${currency}`;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}
