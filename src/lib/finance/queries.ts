// Finance read models (no auth — callers must check permissions).
// Wrapped by lib/actions/finance.ts; also used by scripts/test-finanzas.ts.

import { prisma } from "@/lib/prisma";
import type { ExpenseCategory, OtherIncomeCategory, Sede } from "@/generated/prisma/client";
import { CAPITAL_SIGN, ENTITY_ORDER, isDeductible, monthRangeUtc, shiftMonth } from "@/lib/finance/entities";

// ── Income statement ────────────────────────────────────────────────────────

export type EntityStatement = {
  sede: Sede;
  membershipsConfirmedCents: number;
  /** Registered by reception but not yet matched against the bank. */
  membershipsUnreconciledCents: number;
  /** Bank deposits loaded by accounting but not yet assigned to a member. */
  unassignedDepositsCents: number;
  otherIncome: { category: OtherIncomeCategory; cents: number }[];
  incomeCents: number;
  expenses: { category: ExpenseCategory; cents: number }[];
  expensesCents: number;
  /** Part of expensesCents backed by an invoice to the entity (deductible). */
  deductibleCents: number;
  resultCents: number;
  capitalInCents: number;
  capitalOutCents: number;
  /** All unpaid expenses (accounts payable), regardless of month. */
  payablesCents: number;
};

function sumBy<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return m;
}

export async function computeIncomeStatement(ym: string): Promise<EntityStatement[]> {
  const { start, end } = monthRangeUtc(ym);

  const [payments, others, expenses, capital, payables] = await Promise.all([
    prisma.payment.findMany({
      where: { paidAt: { gte: start, lt: end }, status: { in: ["SUCCEEDED", "PENDING"] } },
      select: { sede: true, status: true, amountCents: true, isPoolEntry: true, memberId: true },
    }),
    prisma.otherIncome.findMany({
      where: { voidedAt: null, date: { gte: start, lt: end } },
      select: { sede: true, category: true, amountCents: true },
    }),
    prisma.expense.findMany({
      where: { voidedAt: null, date: { gte: start, lt: end } },
      select: { sede: true, category: true, amountCents: true, documentType: true, supplierRuc: true },
    }),
    prisma.capitalMovement.findMany({
      where: { voidedAt: null, date: { gte: start, lt: end } },
      select: { sede: true, kind: true, amountCents: true },
    }),
    prisma.expense.groupBy({
      by: ["sede"],
      where: { voidedAt: null, status: "PENDING" },
      _sum: { amountCents: true },
    }),
  ]);

  return ENTITY_ORDER.map((sede) => {
    const p = payments.filter((x) => x.sede === sede);
    // Member payments: confirmed vs still unreconciled. Pool entries are bank
    // deposits not yet assigned — real money, shown on their own line.
    const membershipsConfirmedCents = p
      .filter((x) => !x.isPoolEntry && x.memberId && x.status === "SUCCEEDED")
      .reduce((s, x) => s + x.amountCents, 0);
    const membershipsUnreconciledCents = p
      .filter((x) => !x.isPoolEntry && x.memberId && x.status === "PENDING")
      .reduce((s, x) => s + x.amountCents, 0);
    const unassignedDepositsCents = p
      .filter((x) => x.isPoolEntry && x.status === "SUCCEEDED")
      .reduce((s, x) => s + x.amountCents, 0);

    const o = sumBy(others.filter((x) => x.sede === sede), (x) => x.category, (x) => x.amountCents);
    const otherIncome = [...o].map(([category, cents]) => ({ category: category as OtherIncomeCategory, cents }));
    const otherCents = otherIncome.reduce((s, x) => s + x.cents, 0);

    const ex = expenses.filter((x) => x.sede === sede);
    const e = sumBy(ex, (x) => x.category, (x) => x.amountCents);
    const expenseRows = [...e]
      .map(([category, cents]) => ({ category: category as ExpenseCategory, cents }))
      .sort((a, b) => b.cents - a.cents);
    const expensesCents = expenseRows.reduce((s, x) => s + x.cents, 0);
    const deductibleCents = ex.filter(isDeductible).reduce((s, x) => s + x.amountCents, 0);

    const incomeCents =
      membershipsConfirmedCents + membershipsUnreconciledCents + unassignedDepositsCents + otherCents;

    const c = capital.filter((x) => x.sede === sede);
    const capitalInCents = c.filter((x) => CAPITAL_SIGN[x.kind] > 0).reduce((s, x) => s + x.amountCents, 0);
    const capitalOutCents = c.filter((x) => CAPITAL_SIGN[x.kind] < 0).reduce((s, x) => s + x.amountCents, 0);

    return {
      sede,
      membershipsConfirmedCents,
      membershipsUnreconciledCents,
      unassignedDepositsCents,
      otherIncome,
      incomeCents,
      expenses: expenseRows,
      expensesCents,
      deductibleCents,
      resultCents: incomeCents - expensesCents,
      capitalInCents,
      capitalOutCents,
      payablesCents: payables.find((x) => x.sede === sede)?._sum.amountCents ?? 0,
    };
  });
}

export type TrendRow = {
  ym: string;
  bySede: Record<Sede, { incomeCents: number; expensesCents: number; capitalNetCents: number }>;
};

/** Last `months` months ending at `ym`, per entity. */
export async function computeFinanceTrend(ym: string, months = 12): Promise<TrendRow[]> {
  const firstYm = shiftMonth(ym, -(months - 1));
  const { start } = monthRangeUtc(firstYm);
  const { end } = monthRangeUtc(ym);

  const [payments, others, expenses, capital] = await Promise.all([
    prisma.payment.findMany({
      where: {
        paidAt: { gte: start, lt: end },
        status: { in: ["SUCCEEDED", "PENDING"] },
        OR: [{ isPoolEntry: false, memberId: { not: null } }, { isPoolEntry: true, status: "SUCCEEDED" }],
      },
      select: { sede: true, amountCents: true, paidAt: true },
    }),
    prisma.otherIncome.findMany({
      where: { voidedAt: null, date: { gte: start, lt: end } },
      select: { sede: true, amountCents: true, date: true },
    }),
    prisma.expense.findMany({
      where: { voidedAt: null, date: { gte: start, lt: end } },
      select: { sede: true, amountCents: true, date: true },
    }),
    prisma.capitalMovement.findMany({
      where: { voidedAt: null, date: { gte: start, lt: end } },
      select: { sede: true, amountCents: true, date: true, kind: true },
    }),
  ]);

  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows: TrendRow[] = Array.from({ length: months }, (_, i) => ({
    ym: shiftMonth(firstYm, i),
    bySede: {
      FITNESS_CENTER: { incomeCents: 0, expensesCents: 0, capitalNetCents: 0 },
      XTREME: { incomeCents: 0, expensesCents: 0, capitalNetCents: 0 },
    },
  }));
  const idx = new Map(rows.map((r) => [r.ym, r]));

  for (const p of payments) if (p.paidAt) {
    const r = idx.get(key(p.paidAt));
    if (r) r.bySede[p.sede].incomeCents += p.amountCents;
  }
  for (const o of others) {
    const r = idx.get(key(o.date));
    if (r) r.bySede[o.sede].incomeCents += o.amountCents;
  }
  for (const e of expenses) {
    const r = idx.get(key(e.date));
    if (r) r.bySede[e.sede].expensesCents += e.amountCents;
  }
  for (const c of capital) {
    const r = idx.get(key(c.date));
    if (r) r.bySede[c.sede].capitalNetCents += CAPITAL_SIGN[c.kind] * c.amountCents;
  }
  return rows;
}

export type CapitalBalance = {
  sede: Sede;
  person: string;
  contributedCents: number; // CONTRIBUTION
  loanedCents: number; // SHAREHOLDER_LOAN − LOAN_REPAYMENT
  withdrawnCents: number; // WITHDRAWAL
};

/** All-time balance per person and entity. */
export async function computeCapitalBalances(): Promise<CapitalBalance[]> {
  const grouped = await prisma.capitalMovement.groupBy({
    by: ["sede", "person", "kind"],
    where: { voidedAt: null },
    _sum: { amountCents: true },
  });
  const map = new Map<string, CapitalBalance>();
  for (const g of grouped) {
    const k = `${g.sede}|${g.person}`;
    const b = map.get(k) ?? { sede: g.sede, person: g.person, contributedCents: 0, loanedCents: 0, withdrawnCents: 0 };
    const v = g._sum.amountCents ?? 0;
    if (g.kind === "CONTRIBUTION") b.contributedCents += v;
    if (g.kind === "SHAREHOLDER_LOAN") b.loanedCents += v;
    if (g.kind === "LOAN_REPAYMENT") b.loanedCents -= v;
    if (g.kind === "WITHDRAWAL") b.withdrawnCents += v;
    map.set(k, b);
  }
  return [...map.values()].sort(
    (a, b) => ENTITY_ORDER.indexOf(a.sede) - ENTITY_ORDER.indexOf(b.sede) || a.person.localeCompare(b.person),
  );
}
