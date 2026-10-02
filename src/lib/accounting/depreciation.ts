// Straight-line depreciation of fixed assets (pure). Monthly charge =
// (cost − residual) / useful life, from the month `startsOn` falls in, until
// the asset is fully depreciated or the month before it is disposed of. The
// last month takes the rounding remainder. Approved 2 oct 2026: 10 % a year
// (120 months) by default, as in the signed 2025 statements.

export const DEFAULT_LIFE_MONTHS: Record<string, number> = {
  "1.2.01": 120, // instalaciones y adecuaciones
  "1.2.02": 120, // muebles y equipo de oficina (computadoras: 36, se cambia por activo)
  "1.2.03": 120, // equipos y maquinaria
};
export const FIXED_ASSET_CODES = Object.keys(DEFAULT_LIFE_MONTHS);

export type AssetTerms = {
  costCents: number;
  residualCents: number;
  usefulLifeMonths: number;
  openingAccumulatedCents: number;
  startsOn: Date; // any day of the first month
  disposedOn: Date | null;
};

const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
/** Last day of a month index, UTC midnight. */
export const monthEnd = (idx: number) => new Date(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 0));
export const ymOf = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;

/** Depreciation charged in the month `idx` (year*12 + month0). */
export function chargeForMonth(a: AssetTerms, idx: number): number {
  const first = monthIndex(a.startsOn);
  if (idx < first) return 0;
  if (a.disposedOn && idx >= monthIndex(a.disposedOn)) return 0;
  const remaining = Math.max(0, a.costCents - a.residualCents) - a.openingAccumulatedCents;
  if (remaining <= 0) return 0;
  const monthly = Math.floor((a.costCents - a.residualCents) / a.usefulLifeMonths);
  // N installments: N−1 of `monthly` and a last one with the rounding remainder.
  const n = monthly > 0 ? Math.max(1, Math.floor(remaining / monthly)) : 1;
  const k = idx - first;
  if (k >= n) return 0;
  return k < n - 1 ? monthly : remaining - monthly * (n - 1);
}

/** Accumulated depreciation through the end of month `idx`. */
export function accumulatedThrough(a: AssetTerms, idx: number): number {
  let acc = a.openingAccumulatedCents;
  for (let m = monthIndex(a.startsOn); m <= idx; m++) acc += chargeForMonth(a, m);
  return acc;
}

export const monthIdx = monthIndex;
