/**
 * Pruebas del cálculo de nómina (sin base de datos).  npx tsx scripts/test-nomina.ts
 * Casos verificados a mano con las reglas 2026 (SBU $482, IESS 9,45 / 12,15 %,
 * fondos 8,33 %, tabla IR con fracción básica $12.208).
 */
import { computeLine, defaultDays, fondosReservaFraction, type EmployeeTerms } from "../src/lib/payroll/compute";
import { annualIncomeTax, RULES_BY_YEAR } from "../src/lib/payroll/rules";

let fails = 0;
const eq = (got: number, want: number, what: string) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "✓" : "✗"} ${what}: ${got}${ok ? "" : ` (esperado ${want})`}`);
};
const base: EmployeeTerms = {
  monthlySalaryCents: 48200, weeklyHours: 40, startDate: "2024-01-15", iessAffiliated: true,
  monthlyDecimoTercero: false, monthlyDecimoCuarto: false, monthlyFondosReserva: true,
};
const none = { daysWorked: 30, overtime50Hours: 0, overtime100Hours: 0, bonusCents: 0, otherDeductionsCents: 0, incomeTaxCents: null };

const a = computeLine(base, none, "2026-10");
eq(a.grossCents, 48200, "SBU: materia gravada");
eq(a.iessPersonalCents, 4555, "SBU: IESS personal 9,45 %");
eq(a.iessEmployerCents, 5856, "SBU: IESS patronal 12,15 %");
eq(a.fondosReservaCents, 4015, "SBU: fondos de reserva 8,33 %");
eq(a.decimoTerceroCents, 4017, "SBU: décimo tercero 1/12");
eq(a.decimoCuartoCents, 4017, "SBU: décimo cuarto SBU/12");
eq(a.vacationCents, 2008, "SBU: vacaciones 1/24");
eq(a.incomeTaxCents, 0, "SBU: sin retención de IR");
eq(a.netCents, 48200 + 4015 - 4555, "SBU: neto (fondos mensualizados)");

const m = computeLine({ ...base, monthlyDecimoTercero: true, monthlyDecimoCuarto: true }, none, "2026-10");
eq(m.netCents, 48200 + 4015 + 4017 + 4017 - 4555, "décimos mensualizados suman al neto");

const pt = computeLine({ ...base, monthlySalaryCents: 24100, weeklyHours: 20 }, none, "2026-10");
eq(pt.decimoCuartoCents, 2008, "jornada parcial 20 h: décimo cuarto proporcional");

const ot = computeLine(base, { ...none, overtime50Hours: 4, overtime100Hours: 2 }, "2026-10");
// valor hora 482/240 = 2,0083 → 4 h × 1,5 + 2 h × 2 = 10 h equivalentes = $20,08
eq(ot.overtimeCents, 2008, "horas extra 50 % y 100 %");

const hi = computeLine({ ...base, monthlySalaryCents: 200000 }, none, "2026-10");
// (2000 − 189) × 12 = 21.732 → 167,05 + 463,90 + 185,28 = 816,23 / 12 = 68,02
eq(hi.incomeTaxCents, 6802, "sueldo $2.000: retención IR sugerida");
eq(annualIncomeTax(1_220_800, RULES_BY_YEAR[2026].incomeTax), 0, "IR: fracción básica exenta");

eq(Math.round(fondosReservaFraction("2025-10-11", "2026-10") * 30), 20, "fondos: cumple el año el 11 → 20 días");
eq(fondosReservaFraction("2026-03-01", "2026-10"), 0, "fondos: menos de un año → 0");
const nuevo = computeLine({ ...base, startDate: "2026-03-01" }, none, "2026-10");
eq(nuevo.fondosReservaCents, 0, "fondos: sin derecho el primer año");

eq(defaultDays("2026-10-16", null, "2026-10"), 15, "ingresó el 16 de un mes de 31 días → 15 días");
eq(defaultDays("2026-01-01", "2026-10-10", "2026-10"), 10, "salió el 10 → 10 días");
eq(defaultDays("2026-01-01", null, "2026-02"), 30, "febrero completo = 30 días");

const noIess = computeLine({ ...base, iessAffiliated: false }, none, "2026-10");
eq(noIess.iessPersonalCents + noIess.iessEmployerCents, 0, "sin afiliación: sin aportes");

console.log(fails ? `\n${fails} FALLAS` : "\nTodo bien.");
process.exit(fails ? 1 : 0);
