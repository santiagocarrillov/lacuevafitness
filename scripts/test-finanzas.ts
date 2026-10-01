/**
 * Finanzas (Fase 1a) — read-only checks against the real database.
 * Compares the income statement / trend with independent SQL sums and
 * exercises the pure helpers. Writes nothing.
 *
 * Uso:  npx tsx scripts/test-finanzas.ts [YYYY-MM]
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  fmtMoney,
  isDeductible,
  monthRangeUtc,
  shiftMonth,
} from "../src/lib/finance/entities";
import {
  computeCapitalBalances,
  computeFinanceTrend,
  computeIncomeStatement,
} from "../src/lib/finance/queries";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

async function main() {
  const ym = process.argv[2] ?? "2026-09";

  // ── Pure helpers ──────────────────────────────────────────────────────────
  const r = monthRangeUtc("2026-12");
  check("monthRangeUtc diciembre cruza el año", r.start.toISOString() === "2026-12-01T00:00:00.000Z" && r.end.toISOString() === "2027-01-01T00:00:00.000Z");
  check("shiftMonth −1 desde enero", shiftMonth("2027-01", -1) === "2026-12");
  check("shiftMonth +13", shiftMonth("2026-10", 13) === "2027-11");
  check("fmtMoney negativo", fmtMoney(-123456) === "−$1.235" || fmtMoney(-123456) === "−$1,235", fmtMoney(-123456));
  check("fmtMoney decimales", fmtMoney(1250, { decimals: true }).endsWith("12,50") || fmtMoney(1250, { decimals: true }).endsWith("12.50"), fmtMoney(1250, { decimals: true }));
  check("deducible: factura con RUC", isDeductible({ documentType: "FACTURA", supplierRuc: "1790012345001" }));
  check("no deducible: factura sin RUC", !isDeductible({ documentType: "FACTURA", supplierRuc: null }));
  check("no deducible: sin documento", !isDeductible({ documentType: "SIN_DOCUMENTO", supplierRuc: "1790012345001" }));

  // ── Income statement vs raw SQL ───────────────────────────────────────────
  const { start, end } = monthRangeUtc(ym);
  const st = await computeIncomeStatement(ym);
  check("dos entidades", st.length === 2 && st[0].sede === "FITNESS_CENTER" && st[1].sede === "XTREME");

  const raw = await prisma.$queryRaw<{ sede: string; status: string; pool: boolean; cents: bigint }[]>`
    SELECT sede::text, status::text, "isPoolEntry" AS pool, SUM("amountCents")::bigint AS cents
    FROM "Payment"
    WHERE "paidAt" >= ${start} AND "paidAt" < ${end}
      AND status IN ('SUCCEEDED','PENDING')
      AND ("isPoolEntry" = true OR "memberId" IS NOT NULL)
    GROUP BY 1,2,3`;
  for (const s of st) {
    const sum = (status: string, pool: boolean) =>
      Number(raw.find((x) => x.sede === s.sede && x.status === status && x.pool === pool)?.cents ?? 0);
    check(`${s.sede} confirmadas = SQL`, s.membershipsConfirmedCents === sum("SUCCEEDED", false), fmtMoney(s.membershipsConfirmedCents));
    check(`${s.sede} sin conciliar = SQL`, s.membershipsUnreconciledCents === sum("PENDING", false), fmtMoney(s.membershipsUnreconciledCents));
    check(`${s.sede} depósitos sin asignar = SQL (pool PENDING; SUCCEEDED ya consumido)`, s.unassignedDepositsCents === sum("PENDING", true), fmtMoney(s.unassignedDepositsCents));
    check(
      `${s.sede} resultado = ingresos − gastos`,
      s.resultCents === s.incomeCents - s.expensesCents,
      `${fmtMoney(s.incomeCents)} − ${fmtMoney(s.expensesCents)}`,
    );
    const otherSum = s.otherIncome.reduce((a, b) => a + b.cents, 0);
    check(
      `${s.sede} ingresos = suma de líneas`,
      s.incomeCents === s.membershipsConfirmedCents + s.membershipsUnreconciledCents + s.unassignedDepositsCents + otherSum,
    );
  }

  // ── Trend: the selected month must match the statement ────────────────────
  const trend = await computeFinanceTrend(ym, 12);
  check("tendencia de 12 meses", trend.length === 12 && trend[11].ym === ym && trend[0].ym === shiftMonth(ym, -11));
  for (const s of st) {
    const t = trend[11].bySede[s.sede];
    check(`${s.sede} tendencia = estado (ingresos)`, t.incomeCents === s.incomeCents, `${fmtMoney(t.incomeCents)} vs ${fmtMoney(s.incomeCents)}`);
    check(`${s.sede} tendencia = estado (gastos)`, t.expensesCents === s.expensesCents);
  }

  // ── Capital balances run ──────────────────────────────────────────────────
  const balances = await computeCapitalBalances();
  check("saldos de dueños se calculan", Array.isArray(balances), `${balances.length} filas`);

  console.log(`\n${ym}:`);
  for (const s of st) {
    console.log(
      `  ${s.sede.padEnd(15)} ingresos ${fmtMoney(s.incomeCents).padStart(8)} ` +
      `(confirmado ${fmtMoney(s.membershipsConfirmedCents)}, sin conciliar ${fmtMoney(s.membershipsUnreconciledCents)}) ` +
      `· gastos ${fmtMoney(s.expensesCents)} · resultado ${fmtMoney(s.resultCents)}`,
    );
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main();
