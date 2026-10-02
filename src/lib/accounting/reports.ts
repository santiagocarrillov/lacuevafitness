// Financial reports read ONLY from the journal (posted entries). No auth —
// callers check permissions. Dates are UTC-midnight days, inclusive.

import { prisma } from "@/lib/prisma";
import type { LedgerAccountType, LedgerRole, Prisma, Sede } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

const DEBIT_NORMAL = new Set<LedgerAccountType>(["ASSET", "EXPENSE"]);
export const natural = (type: LedgerAccountType, debit: number, credit: number) =>
  DEBIT_NORMAL.has(type) ? debit - credit : credit - debit;

const posted = (sede: Sede, range: { gte?: Date; lte?: Date; lt?: Date }) =>
  ({ entry: { sede, status: "POSTED", date: range } }) satisfies Prisma.JournalLineWhereInput;

async function sums(db: Db, sede: Sede, range: { gte?: Date; lte?: Date; lt?: Date }) {
  const g = await db.journalLine.groupBy({
    by: ["accountId"],
    where: posted(sede, range),
    _sum: { debitCents: true, creditCents: true },
  });
  return new Map(g.map((r) => [r.accountId, { debit: r._sum.debitCents ?? 0, credit: r._sum.creditCents ?? 0 }]));
}

export type TreeRow = {
  id: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  role: LedgerRole;
  postable: boolean;
  depth: number;
  openingCents: number; // natural side, before `from`
  debitCents: number; // period
  creditCents: number; // period
  closingCents: number; // natural side, at `to`
};

/** Every account with opening / period / closing, groups rolled up from children. */
export async function trialBalance(db: Db, sede: Sede, from: Date, to: Date): Promise<TreeRow[]> {
  const [accounts, before, period] = await Promise.all([
    db.ledgerAccount.findMany({ where: { sede }, orderBy: { code: "asc" } }),
    sums(db, sede, { lt: from }),
    sums(db, sede, { gte: from, lte: to }),
  ]);
  accounts.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  const rows = new Map<string, TreeRow>();
  for (const a of accounts) {
    const b = before.get(a.id) ?? { debit: 0, credit: 0 };
    const p = period.get(a.id) ?? { debit: 0, credit: 0 };
    const openingCents = natural(a.type, b.debit, b.credit);
    rows.set(a.id, {
      id: a.id, code: a.code, name: a.name, type: a.type, role: a.role, postable: a.postable,
      depth: a.code.split(".").length - 1,
      openingCents,
      debitCents: p.debit,
      creditCents: p.credit,
      closingCents: openingCents + natural(a.type, p.debit, p.credit),
    });
  }
  // Roll detail amounts up through the parent chain.
  const parentOf = new Map(accounts.map((a) => [a.id, a.parentId]));
  for (const a of accounts.filter((x) => x.postable)) {
    const src = rows.get(a.id)!;
    let pid = parentOf.get(a.id);
    while (pid) {
      const g = rows.get(pid);
      if (!g) break;
      g.openingCents += src.openingCents;
      g.debitCents += src.debitCents;
      g.creditCents += src.creditCents;
      g.closingCents += src.closingCents;
      pid = parentOf.get(pid);
    }
  }
  return accounts.map((a) => rows.get(a.id)!);
}

export type LedgerLine = {
  entryId: string;
  number: number;
  date: Date;
  description: string;
  source: string;
  sourceId: string | null;
  memo: string | null;
  party: string | null;
  debitCents: number;
  creditCents: number;
  balanceCents: number; // running, natural side
};

export async function generalLedger(db: Db, sede: Sede, accountId: string, from: Date, to: Date) {
  const account = await db.ledgerAccount.findFirst({ where: { id: accountId, sede } });
  if (!account) throw new Error("Cuenta no encontrada.");
  const [before, lines] = await Promise.all([
    db.journalLine.aggregate({ where: { accountId, ...posted(sede, { lt: from }) }, _sum: { debitCents: true, creditCents: true } }),
    db.journalLine.findMany({
      where: { accountId, ...posted(sede, { gte: from, lte: to }) },
      include: { entry: true },
      orderBy: [{ entry: { date: "asc" } }, { entry: { number: "asc" } }],
    }),
  ]);
  const openingCents = natural(account.type, before._sum.debitCents ?? 0, before._sum.creditCents ?? 0);
  let running = openingCents;
  const out: LedgerLine[] = lines.map((l) => {
    running += natural(account.type, l.debitCents, l.creditCents);
    return {
      entryId: l.entryId, number: l.entry.number, date: l.entry.date, description: l.entry.description,
      source: l.entry.source, sourceId: l.entry.sourceId, memo: l.memo, party: l.party,
      debitCents: l.debitCents, creditCents: l.creditCents, balanceCents: running,
    };
  });
  return { account, openingCents, closingCents: running, lines: out };
}

export type Statements = {
  asOf: Date;
  yearStart: Date;
  balance: TreeRow[]; // assets, liabilities, equity (cumulative to asOf)
  income: TreeRow[]; // income + expense accounts for [yearStart, asOf]
  resultCents: number; // income − expenses of the year
  totals: { assets: number; liabilities: number; equity: number; check: number };
};

/** Estado de situación al `asOf` + estado de resultados del año hasta `asOf`. */
export async function statements(db: Db, sede: Sede, asOf: Date): Promise<Statements> {
  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));
  const epoch = new Date(Date.UTC(1900, 0, 1));
  const [cumulative, year] = await Promise.all([
    trialBalance(db, sede, epoch, asOf),
    trialBalance(db, sede, yearStart, asOf),
  ]);
  const balance = cumulative.filter((r) => r.type === "ASSET" || r.type === "LIABILITY" || r.type === "EQUITY");
  // Income statement uses only this year's movements (no closing entries yet).
  const income = year
    .filter((r) => r.type === "INCOME" || r.type === "EXPENSE")
    .map((r) => ({ ...r, closingCents: natural(r.type, r.debitCents, r.creditCents), openingCents: 0 }));
  const top = (rows: TreeRow[], code: string) => rows.find((r) => r.code === code)?.closingCents ?? 0;
  const resultCents = top(income, "4") - top(income, "5");
  const assets = top(balance, "1");
  const liabilities = top(balance, "2");
  // P&L accounts of previous years without a closing entry would also belong to
  // equity; the year-end closing (CLOSING entries) moves them in module 1b.
  const priorPnl =
    cumulative.filter((r) => r.code === "4").reduce((s, r) => s + r.closingCents, 0) -
    cumulative.filter((r) => r.code === "5").reduce((s, r) => s + r.closingCents, 0) -
    resultCents;
  const equity = top(balance, "3") + resultCents + priorPnl;
  return {
    asOf, yearStart, balance, income, resultCents,
    totals: { assets, liabilities, equity, check: assets - liabilities - equity },
  };
}

/** Balance per third party on accounts with a given role (e.g. shareholder loans). */
export async function partyBalances(db: Db, sede: Sede, role: LedgerRole, asOf: Date) {
  const accounts = await db.ledgerAccount.findMany({ where: { sede, role }, select: { id: true, type: true } });
  if (accounts.length === 0) return [];
  const g = await db.journalLine.groupBy({
    by: ["party"],
    where: { accountId: { in: accounts.map((a) => a.id) }, ...posted(sede, { lte: asOf }) },
    _sum: { debitCents: true, creditCents: true },
  });
  const type = accounts[0].type;
  return g
    .map((r) => ({ party: r.party ?? "Sin desglosar", balanceCents: natural(type, r._sum.debitCents ?? 0, r._sum.creditCents ?? 0) }))
    .filter((r) => r.balanceCents !== 0)
    .sort((a, b) => b.balanceCents - a.balanceCents);
}
