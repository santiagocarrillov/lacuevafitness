// Balance sheet roll-forward (no auth — callers must check permissions).
// Opening balances (signed statements) + what the app actually records in the
// year. Accounts without app data are carried at their opening balance and
// say so; nothing is estimated. The full journal comes in Fase 3.

import { prisma } from "@/lib/prisma";
import type { LedgerAccountType, LedgerRole, Prisma, Sede } from "@/generated/prisma/client";
import { monthRangeUtc } from "@/lib/finance/entities";
import { computeFinanceTrend } from "@/lib/finance/queries";

export type BalanceLine = {
  id: string | null; // null for app-derived lines without an account (e.g. 2026 result)
  openingId: string | null;
  code: string;
  name: string;
  type: LedgerAccountType;
  role: LedgerRole | null;
  openingCents: number;
  movementCents: number | null; // null = no app data for this account
  closingCents: number;
  note: string;
};

export type LoanByPerson = { person: string; openingCents: number; movementCents: number; closingCents: number };

export type BalanceSheet = {
  sede: Sede;
  asOf: Date | null; // opening date
  until: Date; // exclusive end (first day after the selected month)
  lines: BalanceLine[];
  totals: { assets: number; liabilities: number; equity: number; difference: number; openingDifference: number };
  loans: LoanByPerson[];
};

const fmtDay = (d: Date) => d.toISOString().slice(0, 10);

export async function computeBalanceSheet(
  sede: Sede,
  ym: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<BalanceSheet> {
  const { end: until } = monthRangeUtc(ym);
  const accounts = await db.ledgerAccount.findMany({
    where: { sede, active: true },
    include: { openingBalances: { orderBy: { asOf: "desc" } } },
    orderBy: { code: "asc" },
  });
  const asOf = accounts.flatMap((a) => a.openingBalances.map((o) => o.asOf)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  if (!asOf) {
    return { sede, asOf: null, until, lines: [], totals: { assets: 0, liabilities: 0, equity: 0, difference: 0, openingDifference: 0 }, loans: [] };
  }
  const period = { gt: asOf, lt: until };

  const [capital, payables, bankLines] = await Promise.all([
    db.capitalMovement.findMany({ where: { sede, voidedAt: null, date: period } }),
    db.expense.aggregate({ where: { sede, voidedAt: null, status: "PENDING", date: period }, _sum: { amountCents: true } }),
    Promise.all(
      accounts
        .filter((a) => a.role === "BANK" && a.bankAccountId)
        .map(async (a) => ({
          accountId: a.id,
          last: await db.bankTransaction.findFirst({
            where: { accountId: a.bankAccountId!, postedAt: { lt: until }, balanceCents: { not: null } },
            orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
          }),
        })),
    ),
  ]);

  const loanMove = capital
    .filter((c) => c.kind === "SHAREHOLDER_LOAN" || c.kind === "LOAN_REPAYMENT")
    .reduce((s, c) => s + (c.kind === "SHAREHOLDER_LOAN" ? c.amountCents : -c.amountCents), 0);
  const contributions = capital.filter((c) => c.kind === "CONTRIBUTION").reduce((s, c) => s + c.amountCents, 0);

  const lines: BalanceLine[] = accounts.map((a) => {
    const openings = a.openingBalances.filter((o) => o.asOf.getTime() === asOf.getTime());
    const openingCents = openings.reduce((s, o) => s + o.amountCents, 0);
    let movementCents: number | null = null;
    let note = "Sin movimientos en la app (llegan con QuickBooks y los ajustes)";
    if (a.role === "BANK") {
      const last = bankLines.find((b) => b.accountId === a.id)?.last;
      if (last?.balanceCents != null) {
        movementCents = last.balanceCents - openingCents;
        note = `Saldo del estado de cuenta al ${fmtDay(last.postedAt)}`;
      } else {
        note = a.bankAccountId ? "Sin estado de cuenta importado" : "Sin cuenta bancaria enlazada";
      }
    } else if (a.role === "SHAREHOLDER_LOANS") {
      movementCents = loanMove;
      note = "Préstamos y devoluciones registrados en Aportes";
    } else if (a.role === "PAYABLES") {
      movementCents = payables._sum.amountCents ?? 0;
      note = "+ gastos del año aún por pagar (el pago del saldo inicial llega con QuickBooks)";
    }
    return {
      id: a.id,
      openingId: openings.length === 1 ? openings[0].id : null,
      code: a.code,
      name: a.name,
      type: a.type,
      role: a.role,
      openingCents,
      movementCents,
      closingCents: openingCents + (movementCents ?? 0),
      note,
    };
  });

  // Equity lines the app produces without an account of their own.
  // Year result: from January after the opening date through the selected month.
  const yearStart = `${asOf.getUTCFullYear() + 1}-01`;
  const months =
    (Number(ym.slice(0, 4)) - Number(yearStart.slice(0, 4))) * 12 + Number(ym.slice(5, 7)) - Number(yearStart.slice(5, 7)) + 1;
  const trend = months > 0 ? await computeFinanceTrend(ym, months) : [];
  const resultCents = trend.reduce((s, r) => s + r.bySede[sede].incomeCents - r.bySede[sede].expensesCents, 0);
  if (contributions) {
    lines.push({
      id: null, openingId: null, code: "3.1.02", name: "Aportes para futura capitalización", type: "EQUITY", role: null,
      openingCents: 0, movementCents: contributions, closingCents: contributions, note: "Aportes registrados en la app",
    });
  }
  lines.push({
    id: null, openingId: null, code: "3.3.01", name: `Resultado ${yearStart.slice(0, 4)} (según la app)`, type: "EQUITY", role: null,
    openingCents: 0, movementCents: resultCents, closingCents: resultCents,
    note: "Ingresos − gastos registrados; incompleto hasta cargar QuickBooks y los ajustes (depreciación, intereses)",
  });

  const total = (t: LedgerAccountType, k: "openingCents" | "closingCents") =>
    lines.filter((l) => l.type === t).reduce((s, l) => s + l[k], 0);
  const assets = total("ASSET", "closingCents");
  const liabilities = total("LIABILITY", "closingCents");
  const equity = total("EQUITY", "closingCents");
  const openingDifference = total("ASSET", "openingCents") - total("LIABILITY", "openingCents") - total("EQUITY", "openingCents");

  // Shareholder loans by person: opening breakdown (if loaded) + the year's movements.
  const loanAcct = accounts.find((a) => a.role === "SHAREHOLDER_LOANS");
  const byPerson = new Map<string, LoanByPerson>();
  const get = (p: string) => byPerson.get(p) ?? byPerson.set(p, { person: p, openingCents: 0, movementCents: 0, closingCents: 0 }).get(p)!;
  for (const o of loanAcct?.openingBalances.filter((o) => o.asOf.getTime() === asOf.getTime()) ?? []) {
    get(o.person ?? "Sin desglosar (pendiente de QuickBooks)").openingCents += o.amountCents;
  }
  for (const c of capital.filter((c) => c.kind === "SHAREHOLDER_LOAN" || c.kind === "LOAN_REPAYMENT")) {
    get(c.person).movementCents += c.kind === "SHAREHOLDER_LOAN" ? c.amountCents : -c.amountCents;
  }
  const loans = [...byPerson.values()].map((l) => ({ ...l, closingCents: l.openingCents + l.movementCents }));

  return {
    sede, asOf, until, lines,
    totals: { assets, liabilities, equity, difference: assets - liabilities - equity, openingDifference },
    loans,
  };
}
