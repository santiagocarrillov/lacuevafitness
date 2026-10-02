// Automatic posting (no auth — callers check permissions). Documents are the
// source of truth; their journal entries are derived and kept in sync:
// unchanged entries stay, changed ones are voided and re-posted, entries of
// removed/voided documents are voided. Closed periods are never touched.
// Design and accounting rules: docs/contabilidad-libro-diario.md

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { JournalSource, Prisma, Sede } from "@/generated/prisma/client";
import { ecuadorDateString } from "@/lib/timezone";
import { sameLines, validateLines, type LineInput } from "@/lib/accounting/journal";
import { formatDocNumber } from "@/lib/invoicing/core";

type Db = Prisma.TransactionClient | typeof prisma;

export const IVA_RATE = 15; // %, prices include IVA (Santiago, 1 oct 2026)
export const AUTO_SOURCES: JournalSource[] = ["PAYMENT", "INVOICE", "OTHER_INCOME", "EXPENSE", "CAPITAL", "DEFERRED_REVENUE"];

/** Splits a VAT-inclusive total. $50 → net 43.48 + IVA 6.52. */
export function splitIva(totalCents: number, rate = IVA_RATE) {
  const iva = Math.round((totalCents * rate) / (100 + rate));
  return { net: totalCents - iva, iva };
}

/** Accounting day of a stored timestamp. Date-only inputs are stored at 00:00
 *  UTC (that UTC date is the day); real timestamps use the Ecuador date. */
export function postingDay(d: Date): Date {
  const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const ymd = isDateOnly ? d.toISOString().slice(0, 10) : ecuadorDateString(d);
  return new Date(`${ymd}T00:00:00.000Z`);
}

const firstOfMonth = (d: Date, plus = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + plus, 1));
const DAY = 86_400_000;

// ── Period close ────────────────────────────────────────────────────────────

export async function lockedThrough(db: Db, sede: Sede): Promise<Date | null> {
  const c = await db.periodClose.findFirst({
    where: { sede, reopenedAt: null },
    orderBy: { lockedThrough: "desc" },
  });
  return c?.lockedThrough ?? null;
}

export async function assertOpen(db: Db, sede: Sede, date: Date) {
  const lock = await lockedThrough(db, sede);
  if (lock && date.getTime() <= lock.getTime()) {
    throw new Error(`El período está cerrado hasta el ${lock.toISOString().slice(0, 10)}: no se puede registrar ni modificar en esa fecha.`);
  }
}

// ── Desired entries from documents ──────────────────────────────────────────

export type Desired = {
  source: JournalSource;
  sourceId: string;
  date: Date;
  description: string;
  lines: LineInput[];
};

const MONTHS: Record<string, number> = { QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12 };

/**
 * How many months a payment prepays. Most "annual"/"semiannual" memberships
 * are commitment plans paid monthly ($40 of a $480 annual): those are NOT
 * deferred. Only a payment covering 2+ months of the plan is.
 */
export function prepaidMonths(amountCents: number, cycle: string | null | undefined, contractCents: number | null | undefined) {
  const m = cycle ? MONTHS[cycle] : undefined;
  if (!m || !contractCents || contractCents <= 0) return 1;
  const perMonth = contractCents / m;
  return Math.max(1, Math.min(m, Math.round(amountCents / perMonth)));
}

async function accountMaps(db: Db, sede: Sede) {
  const accounts = await db.ledgerAccount.findMany({ where: { sede, active: true } });
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  const code = (c: string) => {
    const id = byCode.get(c);
    if (!id) throw new Error(`Falta la cuenta ${c} en el plan de ${sede}: corre el seed de contabilidad.`);
    return id;
  };
  const byBank = new Map(accounts.filter((a) => a.bankAccountId).map((a) => [a.bankAccountId!, a.id]));
  const byCategory = new Map(accounts.filter((a) => a.expenseCategory && a.postable).map((a) => [a.expenseCategory!, a.id]));
  return { code, byBank, byCategory };
}

export async function desiredEntries(db: Db, sede: Sede, from: Date, to: Date): Promise<Desired[]> {
  const A = await accountMaps(db, sede);
  const out: Desired[] = [];
  const inRange = (d: Date) => d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  // Timestamps can sit up to a day off their accounting day; widen, then filter.
  const wide = { gte: new Date(from.getTime() - DAY), lt: new Date(to.getTime() + 2 * DAY) };
  const bankLedger = async (txnId: string | null) => {
    if (!txnId) return null;
    const t = await db.bankTransaction.findUnique({ where: { id: txnId }, select: { accountId: true } });
    return t ? A.byBank.get(t.accountId) ?? null : null;
  };

  // Payments (collections). Pool entries already consumed by a member payment
  // (SUCCEEDED) would double count; unassigned ones (PENDING) are real money.
  // A payment backed by a live invoice is posted by the invoice instead.
  const payments = await db.payment.findMany({
    where: {
      sede,
      paidAt: wide,
      status: { in: ["SUCCEEDED", "PENDING"] },
      NOT: { isPoolEntry: true, status: "SUCCEEDED" },
      OR: [{ invoiceId: null }, { invoice: { status: "VOIDED" } }],
    },
    include: { member: { select: { firstName: true, lastName: true } }, membership: { include: { plan: true } } },
  });
  for (const p of payments) {
    const day = postingDay(p.paidAt!);
    const party = p.member ? `${p.member.firstName} ${p.member.lastName}` : p.depositorName ?? "Depósito sin asignar";
    const debit = (await bankLedger(p.bankTransactionId)) ?? (p.method === "CASH" ? A.code("1.1.01") : A.code("1.1.05"));
    const { net, iva } = splitIva(p.amountCents);
    const plan = p.membership?.plan;
    const cycle = plan?.billingCycle;
    const income = cycle === "ONE_TIME" || cycle === "TRIAL" ? A.code("4.1.02") : A.code("4.1.01");
    const months =
      cycle === "ONE_TIME" || cycle === "TRIAL" ? 1 : prepaidMonths(p.amountCents, cycle, p.membership?.customPriceCents ?? plan?.priceCents);
    const share = Math.floor(net / months);
    const firstShare = net - share * (months - 1); // rounding stays in the first month
    if (inRange(day)) {
      out.push({
        source: "PAYMENT",
        sourceId: p.id,
        date: day,
        description: `Cobro · ${party}${plan ? ` · ${plan.name}` : ""}${months > 1 ? ` (prepago ${months} meses)` : ""}`,
        lines: [
          { accountId: debit, debitCents: p.amountCents, party },
          { accountId: A.code("2.1.06"), creditCents: iva, party },
          { accountId: income, creditCents: firstShare, party },
          ...(months > 1 ? [{ accountId: A.code("2.1.07"), creditCents: net - firstShare, party }] : []),
        ],
      });
    }
    // Deferred revenue: recognize one month's share on the 1st of each following month.
    for (let k = 1; k < months; k++) {
      const d = firstOfMonth(day, k);
      if (!inRange(d)) continue;
      out.push({
        source: "DEFERRED_REVENUE",
        sourceId: `${p.id}:${k}`,
        date: d,
        description: `Ingreso diferido reconocido · ${party} · mes ${k + 1} de ${months}`,
        lines: [
          { accountId: A.code("2.1.07"), debitCents: share, party },
          { accountId: income, creditCents: share, party },
        ],
      });
    }
  }

  // Invoices (Módulo 2): issued at collection, so one entry holds the cash
  // (from the payments behind it), the IVA and each line's revenue, with the
  // same deferral rule as payments.
  const invoices = await db.invoice.findMany({
    where: { sede, status: { not: "VOIDED" }, issueDate: { gte: from, lte: to } },
    include: {
      emissionPoint: true,
      payments: { where: { status: { in: ["SUCCEEDED", "PENDING"] } } },
      lines: { include: { membership: { include: { plan: true } } }, orderBy: { position: "asc" } },
    },
  });
  for (const inv of invoices) {
    const party = inv.buyerName;
    const lines: LineInput[] = [];
    let paid = 0;
    for (const p of inv.payments) {
      const acct = (await bankLedger(p.bankTransactionId)) ?? (p.method === "CASH" ? A.code("1.1.01") : A.code("1.1.05"));
      lines.push({ accountId: acct, debitCents: p.amountCents, party });
      paid += p.amountCents;
    }
    if (paid !== inv.totalCents) lines.push({ accountId: A.code("1.1.05"), debitCents: inv.totalCents - paid, party, memo: "Diferencia entre factura y cobro" });
    lines.push({ accountId: A.code("2.1.06"), creditCents: inv.ivaCents, party });
    for (const l of inv.lines) {
      const income = A.code(l.incomeAccountCode);
      const plan = l.membership?.plan;
      const cycle = plan?.billingCycle;
      const months =
        !plan || cycle === "ONE_TIME" || cycle === "TRIAL"
          ? 1
          : prepaidMonths(l.totalCents, cycle, l.membership?.customPriceCents ?? plan.priceCents);
      const share = Math.floor(l.subtotalCents / months);
      const firstShare = l.subtotalCents - share * (months - 1);
      lines.push({ accountId: income, creditCents: firstShare, party, memo: l.description });
      if (months > 1) lines.push({ accountId: A.code("2.1.07"), creditCents: l.subtotalCents - firstShare, party, memo: l.description });
      for (let k = 1; k < months; k++) {
        const d = firstOfMonth(inv.issueDate, k);
        if (!inRange(d)) continue;
        out.push({
          source: "DEFERRED_REVENUE",
          sourceId: `${l.id}:${k}`,
          date: d,
          description: `Ingreso diferido reconocido · ${party} · ${l.description} · mes ${k + 1} de ${months}`,
          lines: [
            { accountId: A.code("2.1.07"), debitCents: share, party },
            { accountId: income, creditCents: share, party },
          ],
        });
      }
    }
    const num = formatDocNumber(inv.emissionPoint.establishment, inv.emissionPoint.point, inv.sequential);
    out.push({ source: "INVOICE", sourceId: inv.id, date: inv.issueDate, description: `Factura ${num} · ${party}`, lines });
  }

  // Other income: products carry IVA; reimbursements and others do not.
  const others = await db.otherIncome.findMany({ where: { sede, voidedAt: null, date: { gte: from, lte: to } } });
  for (const o of others) {
    const debit = (await bankLedger(o.bankTransactionId)) ?? A.code("1.1.01");
    const isProduct = o.category === "PRODUCT_SALE";
    const { net, iva } = isProduct ? splitIva(o.amountCents) : { net: o.amountCents, iva: 0 };
    out.push({
      source: "OTHER_INCOME",
      sourceId: o.id,
      date: o.date,
      description: o.description,
      lines: [
        { accountId: debit, debitCents: o.amountCents },
        { accountId: A.code("2.1.06"), creditCents: iva },
        { accountId: A.code(isProduct ? "4.1.03" : o.category === "REIMBURSEMENT" ? "4.2.02" : "4.2.01"), creditCents: net },
      ],
    });
  }

  // Expenses: accrual (expense + IVA credit vs. payables) and, once paid, the payment.
  const expenses = await db.expense.findMany({
    where: { sede, voidedAt: null, OR: [{ date: { gte: from, lte: to } }, { paidAt: { gte: from, lte: to } }] },
  });
  for (const e of expenses) {
    const party = e.supplierName ?? null;
    const iva = e.ivaCents ?? 0;
    const expenseAcct = A.byCategory.get(e.category) ?? A.code("5.3.99");
    if (inRange(e.date)) {
      out.push({
        source: "EXPENSE",
        sourceId: e.id,
        date: e.date,
        description: `Gasto · ${e.description}${e.documentNumber ? ` · ${e.documentNumber}` : ""}`,
        lines: [
          { accountId: expenseAcct, debitCents: e.amountCents - iva, party },
          { accountId: A.code("1.3.01"), debitCents: iva, party },
          { accountId: A.code("2.1.01"), creditCents: e.amountCents, party },
        ],
      });
    }
    if (e.status === "PAID") {
      const paidDay = e.paidAt ?? e.date;
      if (!inRange(paidDay)) continue;
      const credit =
        (await bankLedger(e.bankTransactionId)) ??
        (e.paymentMethod === "CASH" ? A.code("1.1.01") : e.paymentMethod === "CREDIT_CARD" ? A.code("2.1.09") : A.code("1.1.05"));
      out.push({
        source: "EXPENSE",
        sourceId: `${e.id}:pago`,
        date: paidDay,
        description: `Pago · ${e.description}`,
        lines: [
          { accountId: A.code("2.1.01"), debitCents: e.amountCents, party },
          { accountId: credit, creditCents: e.amountCents, party },
        ],
      });
    }
  }

  // Owners' money: shareholder loans (S.A.S.), contributions and withdrawals.
  const capital = await db.capitalMovement.findMany({ where: { sede, voidedAt: null, date: { gte: from, lte: to } } });
  for (const c of capital) {
    const cash = (await bankLedger(c.bankTransactionId)) ?? A.code("1.1.05");
    const inflow = c.kind === "CONTRIBUTION" || c.kind === "SHAREHOLDER_LOAN";
    const equityOrLoan = c.kind === "SHAREHOLDER_LOAN" || c.kind === "LOAN_REPAYMENT" ? A.code("2.2.01") : A.code("3.1.02");
    const label = { CONTRIBUTION: "Aporte", SHAREHOLDER_LOAN: "Préstamo de accionista", LOAN_REPAYMENT: "Devolución de préstamo", WITHDRAWAL: "Retiro del dueño" }[c.kind];
    out.push({
      source: "CAPITAL",
      sourceId: c.id,
      date: c.date,
      description: `${label} · ${c.person}`,
      lines: inflow
        ? [{ accountId: cash, debitCents: c.amountCents, party: c.person }, { accountId: equityOrLoan, creditCents: c.amountCents, party: c.person }]
        : [{ accountId: equityOrLoan, debitCents: c.amountCents, party: c.person }, { accountId: cash, creditCents: c.amountCents, party: c.person }],
    });
  }
  return out;
}

// ── Sync ────────────────────────────────────────────────────────────────────

export type SyncResult = {
  created: number;
  voided: number;
  unchanged: number;
  locked: string[]; // descriptions of changes skipped because the month is closed
  errors: string[];
};

export async function syncJournal(db: Db, sede: Sede, from: Date, to: Date, userId?: string | null): Promise<SyncResult> {
  // One sync per entity at a time (serializes numbering too).
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journal-sync-${sede}`}))`;
  const lock = await lockedThrough(db, sede);
  const isLocked = (d: Date) => !!lock && d.getTime() <= lock.getTime();

  const desired = await desiredEntries(db, sede, from, to);
  const existing = await db.journalEntry.findMany({
    where: { sede, status: "POSTED", source: { in: AUTO_SOURCES }, date: { gte: from, lte: to } },
    include: { lines: true },
  });
  const byKey = new Map(existing.map((e) => [`${e.source}|${e.sourceId}`, e]));
  const result: SyncResult = { created: 0, voided: 0, unchanged: 0, locked: [], errors: [] };
  const toVoid: string[] = [];
  const toCreate: (Desired & { lines: ReturnType<typeof validateLines>["lines"] })[] = [];
  const seen = new Set<string>();

  for (const d of desired) {
    const key = `${d.source}|${d.sourceId}`;
    seen.add(key);
    let lines;
    try {
      lines = validateLines(d.lines).lines;
    } catch (e) {
      result.errors.push(`${d.description}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const cur = byKey.get(key);
    if (cur && cur.date.getTime() === d.date.getTime() && sameLines(cur.lines, lines)) {
      result.unchanged++;
      continue;
    }
    if (isLocked(d.date) || (cur && isLocked(cur.date))) {
      result.locked.push(d.description);
      continue;
    }
    if (cur) toVoid.push(cur.id);
    toCreate.push({ ...d, lines });
  }
  for (const e of existing) {
    if (seen.has(`${e.source}|${e.sourceId}`)) continue;
    if (isLocked(e.date)) result.locked.push(`${e.description} (documento anulado)`);
    else toVoid.push(e.id);
  }

  if (toVoid.length) {
    await db.journalEntry.updateMany({
      where: { id: { in: toVoid } },
      data: { status: "VOIDED", voidedAt: new Date(), voidReason: "El documento cambió o se anuló: se recontabiliza" },
    });
    result.voided = toVoid.length;
  }
  if (toCreate.length) {
    toCreate.sort((a, b) => a.date.getTime() - b.date.getTime());
    const last = await db.journalEntry.aggregate({ where: { sede }, _max: { number: true } });
    let n = last._max.number ?? 0;
    const entries = toCreate.map((d) => ({
      id: randomUUID(),
      sede,
      number: ++n,
      date: d.date,
      description: d.description,
      source: d.source,
      sourceId: d.sourceId,
      createdById: userId ?? null,
    }));
    await db.journalEntry.createMany({ data: entries });
    await db.journalLine.createMany({
      data: toCreate.flatMap((d, i) => d.lines.map((l) => ({ ...l, entryId: entries[i].id }))),
    });
    result.created = entries.length;
  }
  return result;
}

/** The posting window: from the day after the opening balances to today. */
export async function postingWindow(db: Db, sede: Sede): Promise<{ from: Date; to: Date }> {
  const opening = await db.journalEntry.findFirst({ where: { sede, source: "OPENING", status: "POSTED" }, select: { date: true } });
  const from = opening ? new Date(opening.date.getTime() + DAY) : new Date("2026-01-01T00:00:00.000Z");
  const to = new Date(`${ecuadorDateString()}T00:00:00.000Z`);
  return { from, to };
}
