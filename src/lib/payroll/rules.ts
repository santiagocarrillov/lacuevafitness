// Ecuadorian payroll rules, by year (client-safe). Verified 4 oct 2026:
// SBU 2026 = $482 (Acuerdo MDT-2025-195); IESS private sector 9,45 % personal
// and 11,15 % + 0,5 % IECE + 0,5 % SECAP employer; fondos de reserva 8,33 %
// from the 13th month; IR table 2026 (Res. NAC-DGERCGC25-00000043, fracción
// básica $12.208). Add a year here when the government publishes it.

export type YearRules = {
  sbuCents: number;
  /** Progressive IR table: [from, rate %] — the tax up to each step is derived. */
  incomeTax: [fromCents: number, ratePct: number][];
};

export const RULES_BY_YEAR: Record<number, YearRules> = {
  2026: {
    sbuCents: 48200,
    incomeTax: [
      [0, 0],
      [1_220_800, 5],
      [1_554_900, 10],
      [2_018_800, 12],
      [2_670_000, 15],
      [3_513_600, 20],
      [4_657_500, 25],
      [6_200_500, 30],
      [8_267_900, 35],
      [10_995_600, 37],
    ],
  },
};

export const IESS_PERSONAL_PCT = 9.45;
export const IESS_EMPLOYER_PCT = 12.15; // 11,15 + IECE 0,5 + SECAP 0,5
export const FONDOS_RESERVA_PCT = 8.33;

/** Rules of a year; a later year not loaded yet falls back to the newest one. */
export function rulesFor(year: number): { rules: YearRules; year: number; exact: boolean } {
  if (RULES_BY_YEAR[year]) return { rules: RULES_BY_YEAR[year], year, exact: true };
  const known = Object.keys(RULES_BY_YEAR).map(Number).sort((a, b) => a - b);
  const pick = known.filter((y) => y <= year).pop() ?? known[0];
  return { rules: RULES_BY_YEAR[pick], year: pick, exact: false };
}

/** Annual income tax for a taxable base (cents), from the progressive table. */
export function annualIncomeTax(baseCents: number, table: YearRules["incomeTax"]): number {
  let tax = 0;
  for (let i = 0; i < table.length; i++) {
    const [from, rate] = table[i];
    const to = table[i + 1]?.[0] ?? Infinity;
    if (baseCents <= from) break;
    tax += ((Math.min(baseCents, to) - from) * rate) / 100;
  }
  return Math.round(tax);
}

/**
 * Legal dates: décimo tercero by 24 Dec (period 1 Dec–30 Nov); décimo cuarto
 * Sierra/Amazonía by 15 Aug (1 Aug–31 Jul), Costa/Galápagos by 15 Mar
 * (1 Mar–28 Feb); utilidades by 15 Apr; IESS planilla by the 15th of the next month.
 */
export const PAYROLL_DEADLINES = {
  decimoTercero: { month: 12, day: 24 },
  decimoCuartoSierra: { month: 8, day: 15 },
  decimoCuartoCosta: { month: 3, day: 15 },
  utilidades: { month: 4, day: 15 },
  iessPlanillaDay: 15,
} as const;
