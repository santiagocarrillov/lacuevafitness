// One payroll line, Ecuadorian law (client-safe, pure). Commercial month of 30
// days; hourly value = salary ÷ (weekly hours × 6) — 240 h for 40 h/week.
// See rules.ts for the rates and where they come from.

import { FONDOS_RESERVA_PCT, IESS_EMPLOYER_PCT, IESS_PERSONAL_PCT, annualIncomeTax, rulesFor } from "./rules";

export type EmployeeTerms = {
  monthlySalaryCents: number;
  weeklyHours: number;
  startDate: string; // YYYY-MM-DD
  iessAffiliated: boolean;
  monthlyDecimoTercero: boolean;
  monthlyDecimoCuarto: boolean;
  monthlyFondosReserva: boolean;
};

export type LineInputs = {
  daysWorked: number;
  overtime50Hours: number;
  overtime100Hours: number;
  bonusCents: number;
  otherDeductionsCents: number;
  /** null = use the suggested withholding. */
  incomeTaxCents: number | null;
};

export type LineResult = {
  baseCents: number;
  overtimeCents: number;
  grossCents: number;
  iessPersonalCents: number;
  iessEmployerCents: number;
  fondosReservaCents: number;
  decimoTerceroCents: number;
  decimoCuartoCents: number;
  vacationCents: number;
  suggestedIncomeTaxCents: number;
  incomeTaxCents: number;
  /** What goes to the worker this month (mensualized benefits included). */
  netCents: number;
  /** Cost for the company: gross + employer IESS + every benefit (paid or accrued). */
  employerCostCents: number;
  /** Fondos de reserva only owed for part of the month (anniversary inside it). */
  fondosFraction: number;
  rulesYear: number;
  rulesExact: boolean;
};

const pct = (cents: number, p: number) => Math.round((cents * p) / 100);

/** Share of the month (1 Jan..30) in which the worker has more than a year of service. */
export function fondosReservaFraction(startDate: string, period: string): number {
  const [y, m] = period.split("-").map(Number);
  const anniversary = new Date(`${startDate}T00:00:00Z`);
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  if (anniversary <= first) return 1;
  if (anniversary > last) return 0;
  const daysAfter = Math.min(30, 30 - (anniversary.getUTCDate() - 1));
  return Math.max(0, daysAfter) / 30;
}

export function computeLine(t: EmployeeTerms, inp: LineInputs, period: string): LineResult {
  const { rules, year, exact } = rulesFor(Number(period.slice(0, 4)));
  const days = Math.max(0, Math.min(30, Math.round(inp.daysWorked)));
  const baseCents = Math.round((t.monthlySalaryCents * days) / 30);
  const hours = Math.max(1, t.weeklyHours) * 6;
  const hourly = t.monthlySalaryCents / hours;
  const overtimeCents = Math.round(hourly * 1.5 * inp.overtime50Hours + hourly * 2 * inp.overtime100Hours);
  const grossCents = baseCents + overtimeCents + Math.max(0, inp.bonusCents);

  const iessPersonalCents = t.iessAffiliated ? pct(grossCents, IESS_PERSONAL_PCT) : 0;
  const iessEmployerCents = t.iessAffiliated ? pct(grossCents, IESS_EMPLOYER_PCT) : 0;
  const fondosFraction = fondosReservaFraction(t.startDate, period);
  const fondosReservaCents = Math.round(pct(grossCents, FONDOS_RESERVA_PCT) * fondosFraction);
  const decimoTerceroCents = Math.round(grossCents / 12);
  const jornada = Math.min(1, Math.max(0, t.weeklyHours) / 40);
  const decimoCuartoCents = Math.round((rules.sbuCents / 12) * (days / 30) * jornada);
  const vacationCents = Math.round(grossCents / 24);

  // Withholding: this month's taxable income projected to the year (décimos
  // and fondos de reserva are exempt). Without the worker's projected
  // personal expenses, so it can only err on the high side — editable.
  const annualBase = (grossCents - iessPersonalCents) * 12;
  const suggestedIncomeTaxCents = Math.round(annualIncomeTax(annualBase, rules.incomeTax) / 12);
  const incomeTaxCents = inp.incomeTaxCents ?? suggestedIncomeTaxCents;

  const paidBenefits =
    (t.monthlyDecimoTercero ? decimoTerceroCents : 0) +
    (t.monthlyDecimoCuarto ? decimoCuartoCents : 0) +
    (t.monthlyFondosReserva ? fondosReservaCents : 0);
  const netCents = grossCents + paidBenefits - iessPersonalCents - incomeTaxCents - Math.max(0, inp.otherDeductionsCents);
  const employerCostCents = grossCents + iessEmployerCents + fondosReservaCents + decimoTerceroCents + decimoCuartoCents + vacationCents;

  return {
    baseCents, overtimeCents, grossCents, iessPersonalCents, iessEmployerCents, fondosReservaCents,
    decimoTerceroCents, decimoCuartoCents, vacationCents, suggestedIncomeTaxCents, incomeTaxCents,
    netCents, employerCostCents, fondosFraction, rulesYear: year, rulesExact: exact,
  };
}

/** Days of the period the worker was employed (30-day commercial month). */
export function defaultDays(startDate: string, endDate: string | null, period: string): number {
  const [y, m] = period.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = endDate ? Date.parse(`${endDate}T00:00:00Z`) : Infinity;
  const from = Math.max(first, start);
  const to = Math.min(Date.UTC(y, m - 1, lastDay), end);
  if (to < from) return 0;
  const fromDay = new Date(from).getUTCDate();
  const toDay = new Date(to).getUTCDate() === lastDay ? 30 : new Date(to).getUTCDate();
  return Math.max(0, Math.min(30, toDay - fromDay + 1));
}
