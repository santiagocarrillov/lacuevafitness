// Read model of the accounting home (no auth — the page checks permissions).
// Operational figures, like the monthly summary: income by payment date,
// expenses by document date. The statements themselves live in Reportes and
// read only from the journal.

import { prisma } from "@/lib/prisma";
import type { Sede } from "@/generated/prisma/client";
import { lockedThrough } from "@/lib/accounting/posting";
import { natural } from "@/lib/accounting/reports";
import { ENTITIES, ENTITY_ORDER, EXPENSE_CATEGORY_LABELS, OTHER_INCOME_LABELS, monthRangeUtc, shiftMonth } from "@/lib/finance/entities";
import { computeFinanceTrend, computeIncomeStatement } from "@/lib/finance/queries";
import { sriDueDate } from "@/lib/taxes/calendar";

/** One entity or the consolidated view of all of them. */
export type EntityView = Sede | "ALL";

export function parseEntityView(v: string | undefined): EntityView {
  return v === "FITNESS_CENTER" || v === "XTREME" ? v : "ALL";
}

export type Slice = { label: string; cents: number; href: string };

export type HomeData = {
  sedes: Sede[];
  incomeCents: number;
  expensesCents: number;
  resultCents: number;
  /** Same month last year, to show the change. */
  prevYear: { incomeCents: number; expensesCents: number; resultCents: number };
  incomeSlices: Slice[];
  expenseSlices: Slice[];
  trend: { ym: string; incomeCents: number; expensesCents: number }[];
  todo: {
    uninvoicedPayments: number;
    invoicesToFix: number;
    unreconciledCents: number;
    expensesToReview: number;
    payablesCount: number;
    payablesCents: number;
    overduePayables: number;
    bankPending: number;
    openMonths: { sede: Sede; lockedThrough: string | null }[];
  };
  banks: {
    id: string;
    name: string;
    last4: string | null;
    sede: Sede;
    pending: number;
    bankCents: number | null;
    bankAsOf: Date | null;
    bookCents: number;
  }[];
  taxes: { sede: Sede; ivaDue: string | null; atsDue: string | null }[];
  /** Owners' money this month (never income). */
  capital: { inCents: number; outCents: number };
  /** Unpaid supplier documents, soonest due first. */
  payablesTop: { id: string; name: string; amountCents: number; dueDate: Date | null; sede: Sede }[];
};

export async function computeHome(ym: string, view: EntityView, today: string): Promise<HomeData> {
  const sedes = view === "ALL" ? ENTITY_ORDER : [view];
  const inView = <T extends { sede: Sede }>(rows: T[]) => rows.filter((r) => sedes.includes(r.sede));
  const { start, end } = monthRangeUtc(ym);
  const q = (extra: string) => `${extra}${view === "ALL" ? "" : `&entidad=${view}`}`;

  const [statement, prev, trend, toReview, payables, uninvoiced, toFix, accounts, pending, closes] = await Promise.all([
    computeIncomeStatement(ym).then(inView),
    computeIncomeStatement(shiftMonth(ym, -12)).then(inView),
    computeFinanceTrend(ym, 12),
    prisma.expense.count({ where: { reviewedAt: null, voidedAt: null, sede: { in: sedes } } }),
    prisma.expense.findMany({
      where: { voidedAt: null, status: "PENDING", sede: { in: sedes } },
      select: { id: true, amountCents: true, dueDate: true, date: true, supplierName: true, description: true, sede: true },
    }),
    prisma.payment.count({
      where: {
        sede: { in: sedes },
        isPoolEntry: false,
        status: { in: ["SUCCEEDED", "PENDING"] },
        paidAt: { gte: start, lt: end },
        OR: [{ invoiceId: null }, { invoice: { status: "VOIDED" } }],
      },
    }),
    prisma.invoice.count({ where: { sede: { in: sedes }, status: { in: ["DRAFT", "REJECTED"] } } }),
    prisma.bankAccount.findMany({
      where: { active: true, sede: { in: sedes } },
      orderBy: [{ sede: "asc" }, { name: "asc" }],
      include: { ledgerAccounts: { select: { id: true, type: true } } },
    }),
    prisma.bankTransaction.groupBy({ by: ["accountId"], where: { status: "PENDING" }, _count: { _all: true } }),
    Promise.all(sedes.map(async (sede) => ({ sede, d: await lockedThrough(prisma, sede) }))),
  ]);

  // Bank balance (last statement line that carries one) vs. book balance.
  const banks = await Promise.all(
    accounts.map(async (a) => {
      const [last, book] = await Promise.all([
        prisma.bankTransaction.findFirst({
          where: { accountId: a.id, balanceCents: { not: null } },
          orderBy: { postedAt: "desc" },
          select: { balanceCents: true, postedAt: true },
        }),
        a.ledgerAccounts.length
          ? prisma.journalLine.aggregate({
              where: { accountId: { in: a.ledgerAccounts.map((l) => l.id) }, entry: { status: "POSTED" } },
              _sum: { debitCents: true, creditCents: true },
            })
          : null,
      ]);
      return {
        id: a.id,
        name: a.name,
        last4: a.last4,
        sede: a.sede,
        pending: pending.find((p) => p.accountId === a.id)?._count._all ?? 0,
        bankCents: last?.balanceCents ?? null,
        bankAsOf: last?.postedAt ?? null,
        bookCents: book ? natural("ASSET", book._sum.debitCents ?? 0, book._sum.creditCents ?? 0) : 0,
      };
    }),
  );

  const sum = (f: (s: (typeof statement)[number]) => number, rows = statement) => rows.reduce((a, s) => a + f(s), 0);
  const incomeCents = sum((s) => s.incomeCents);
  const expensesCents = sum((s) => s.expensesCents);

  const incomeSlices: Slice[] = [
    { label: "Membresías", cents: sum((s) => s.membershipsConfirmedCents + s.membershipsUnreconciledCents), href: "/dashboard/pagos" },
    { label: "Depósitos sin asignar", cents: sum((s) => s.unassignedDepositsCents), href: "/dashboard/pagos" },
  ];
  const otherCats = new Map<string, number>();
  for (const s of statement) for (const o of s.otherIncome) otherCats.set(o.category, (otherCats.get(o.category) ?? 0) + o.cents);
  for (const [c, cents] of otherCats) {
    incomeSlices.push({ label: OTHER_INCOME_LABELS[c as keyof typeof OTHER_INCOME_LABELS], cents, href: `/dashboard/finanzas/otros-ingresos?mes=${ym}` });
  }

  const expCats = new Map<string, number>();
  for (const s of statement) for (const e of s.expenses) expCats.set(e.category, (expCats.get(e.category) ?? 0) + e.cents);
  const expenseSlices = [...expCats]
    .map(([c, cents]) => ({
      label: EXPENSE_CATEGORY_LABELS[c as keyof typeof EXPENSE_CATEGORY_LABELS],
      cents,
      href: `/dashboard/gastos?${q(`mes=${ym}&categoria=${c}`)}`,
    }))
    .sort((a, b) => b.cents - a.cents);

  return {
    sedes,
    incomeCents,
    expensesCents,
    resultCents: incomeCents - expensesCents,
    prevYear: {
      incomeCents: sum((s) => s.incomeCents, prev),
      expensesCents: sum((s) => s.expensesCents, prev),
      resultCents: sum((s) => s.resultCents, prev),
    },
    incomeSlices: incomeSlices.filter((s) => s.cents > 0),
    expenseSlices,
    trend: trend.map((r) => ({
      ym: r.ym,
      incomeCents: sedes.reduce((a, s) => a + r.bySede[s].incomeCents, 0),
      expensesCents: sedes.reduce((a, s) => a + r.bySede[s].expensesCents, 0),
    })),
    todo: {
      uninvoicedPayments: uninvoiced,
      invoicesToFix: toFix,
      unreconciledCents: sum((s) => s.membershipsUnreconciledCents),
      expensesToReview: toReview,
      payablesCount: payables.length,
      payablesCents: payables.reduce((a, p) => a + p.amountCents, 0),
      overduePayables: payables.filter((p) => p.dueDate && p.dueDate.toISOString().slice(0, 10) < today).length,
      bankPending: banks.reduce((a, b) => a + b.pending, 0),
      openMonths: closes.map((c) => ({ sede: c.sede, lockedThrough: c.d ? c.d.toISOString().slice(0, 10) : null })),
    },
    banks,
    capital: { inCents: sum((s) => s.capitalInCents), outCents: sum((s) => s.capitalOutCents) },
    payablesTop: [...payables]
      .sort((a, b) => (a.dueDate ?? a.date).getTime() - (b.dueDate ?? b.date).getTime())
      .slice(0, 5)
      .map((p) => ({ id: p.id, name: p.supplierName || p.description, amountCents: p.amountCents, dueDate: p.dueDate, sede: p.sede })),
    // Next declarations still ahead: IVA (104) is due the month after the
    // period; the ATS the month after that.
    taxes: sedes.map((sede) => {
      const ruc = ENTITIES[sede].ruc;
      const next = (monthsAfter: number) => {
        const thisPeriod = shiftMonth(today.slice(0, 7), -monthsAfter);
        const due = sriDueDate(ruc, thisPeriod, monthsAfter);
        return due && due < today ? sriDueDate(ruc, shiftMonth(thisPeriod, 1), monthsAfter) : due;
      };
      return { sede, ivaDue: next(1), atsDue: ENTITIES[sede].accountingRequired ? next(2) : null };
    }),
  };
}
