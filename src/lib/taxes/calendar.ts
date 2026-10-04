// SRI due dates (no server imports). Monthly declarations are due on a day of
// the following month set by the 9th digit of the RUC (Reglamento LRTI,
// art. 158): 1→10, 2→12 … 9→26, 0→28. If it falls on a weekend it moves to the
// next business day; national holidays are not modelled yet.

const DAY_BY_NINTH_DIGIT: Record<string, number> = {
  "1": 10, "2": 12, "3": 14, "4": 16, "5": 18, "6": 20, "7": 22, "8": 24, "9": 26, "0": 28,
};

/** Day of the month a RUC declares on (null if the RUC is not valid). */
export function sriDueDay(ruc: string | null): number | null {
  if (!ruc || !/^\d{13}$/.test(ruc)) return null;
  return DAY_BY_NINTH_DIGIT[ruc[8]] ?? null;
}

/** Due date (YYYY-MM-DD) of a monthly declaration for period `ym`, `monthsAfter` months later. */
export function sriDueDate(ruc: string | null, ym: string, monthsAfter = 1): string | null {
  const day = sriDueDay(ruc);
  if (!day) return null;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + monthsAfter, day));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
