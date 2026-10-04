// Bank reconciliation core (no auth — callers must check permissions).
// Used by lib/actions/bank.ts and by scripts/test-banco.ts, which runs the
// write paths inside a rolled-back transaction.

import { resolveSupplier } from "@/lib/finance/suppliers";
import { PRIVATE_CATEGORIES } from "@/lib/expenses/core";
import { prisma } from "@/lib/prisma";
import { ecuadorDateString } from "@/lib/timezone";
import type {
  BankTxnKind,
  ExpensePayMethod,
  PaymentStatus,
  Sede,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  LIABILITY_CODES,
  LIABILITY_LABELS,
  duePeriod,
  isIessDebit,
  isSriDebit,
  suggest,
  type CandidatePayment,
  type Decision,
  type LiabilityDue,
  type LiabilityTo,
  type LineIn,
  type PayrollCandidate,
  type RuleLabel,
  type ScoredCandidate,
  type Suggestion,
} from "@/lib/finance/bank-suggest";
import { assertOpen } from "@/lib/accounting/posting";
import { IVA_START, ivaMonth } from "@/lib/taxes/iva";

/** Ecuador calendar day of an instant, as the UTC-midnight Date used by @db.Date. */
function ecDay(d: Date) {
  return new Date(`${ecuadorDateString(d)}T00:00:00.000Z`);
}

// ── Inbox ───────────────────────────────────────────────────────────────────

export type InboxLine = LineIn & {
  accountId: string;
  accountName: string;
  sede: Sede;
  suggestion: Suggestion | null;
  candidates: ScoredCandidate[];
  /** Debits: net salaries still unmatched (for the "Sueldos" option). */
  payroll: PayrollCandidate[];
  /** SRI / IESS debits: what the books owe for the month it pays. */
  due: LiabilityDue | null;
};

// ── What the books owe the IESS and the SRI ────────────────────────────────

/** Already paid through the bank for that month? Then nothing is proposed twice. */
async function alreadyPaid(db: Prisma.TransactionClient | typeof prisma, sede: Sede, to: LiabilityTo, period: string) {
  const rows = await db.bankTransaction.findMany({
    where: { status: "CLASSIFIED", kind: to === "SRI" ? "TAXES" : "PAYROLL", account: { sede } },
    select: { appliedJson: true },
  });
  return rows.some((r) => {
    const d = (r.appliedJson as { decision?: Decision } | null)?.decision;
    return d?.type === "LIABILITY_PAYMENT" && d.to === to && d.period === period;
  });
}

/**
 * IESS: the aportes (and accumulated fondos de reserva) of the approved rol.
 * SRI: the IVA of the month's sales less the credit the 104 applies, plus the
 * income tax withheld from salaries.
 */
export async function liabilityDue(sede: Sede, to: LiabilityTo, period: string): Promise<LiabilityDue | null> {
  if (await alreadyPaid(prisma, sede, to, period)) return null;
  const run = await prisma.payrollRun.findUnique({
    where: { sede_period: { sede, period } },
    include: { lines: { include: { employee: { select: { monthlyFondosReserva: true } } } } },
  });
  const rol = run && (run.status === "APPROVED" || run.status === "PAID") ? run.lines : [];
  const sum = (f: (l: (typeof rol)[number]) => number) => rol.reduce((a, l) => a + f(l), 0);
  const parts: { code: string; cents: number }[] = [];
  if (to === "IESS") {
    if (!rol.length) return null;
    parts.push({ code: "2.1.03", cents: sum((l) => l.iessEmployerCents) });
    parts.push({ code: "2.1.04", cents: sum((l) => l.iessPersonalCents) });
    parts.push({ code: "2.1.05", cents: sum((l) => (l.employee.monthlyFondosReserva ? 0 : l.fondosReservaCents)) });
  } else {
    if (period < IVA_START) return null;
    const iva = await ivaMonth(sede, period);
    if (iva.toPay > 0) {
      parts.push({ code: "2.1.06", cents: iva.sales.ivaCents });
      parts.push({ code: "1.3.01", cents: -(iva.sales.ivaCents - iva.toPay) });
    }
    parts.push({ code: "2.1.13", cents: sum((l) => l.incomeTaxCents) });
  }
  const kept = parts.filter((p) => p.cents !== 0).map((p) => ({ ...p, label: LIABILITY_LABELS[p.code] }));
  const totalCents = kept.reduce((a, p) => a + p.cents, 0);
  return totalCents > 0 ? { to, period, parts: kept, totalCents } : null;
}

export async function buildInbox(filter: { accountId?: string; importBatch?: string; id?: string; account?: { sede: { in: Sede[] } } }, limit = 300): Promise<InboxLine[]> {
  const lines = await prisma.bankTransaction.findMany({
    where: { status: "PENDING", ...filter, account: { active: true, ...filter.account } },
    include: { account: true },
    orderBy: [{ postedAt: "asc" }],
    take: limit,
  });
  if (lines.length === 0) return [];

  const sedes = [...new Set(lines.map((l) => l.account.sede))];
  const minT = Math.min(...lines.map((l) => l.postedAt.getTime()));
  const maxT = Math.max(...lines.map((l) => l.postedAt.getTime()));

  const [rules, payments, siblings, others, payrollLines, runsBySede] = await Promise.all([
    prisma.bankRule.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    // Member payments not yet backed by a bank line — including ones confirmed
    // or reconciled by hand before the bank import existed (28 sep 2026), so
    // their deposit is matched instead of becoming a duplicate pool entry.
    prisma.payment.findMany({
      where: {
        sede: { in: sedes },
        isPoolEntry: false,
        memberId: { not: null },
        bankTransactionId: null,
        status: { in: ["PENDING", "SUCCEEDED"] },
        paidAt: { gte: new Date(minT - 25 * 86_400_000), lte: new Date(maxT + 5 * 86_400_000) },
      },
      include: { member: { select: { firstName: true, lastName: true } } },
    }),
    // Same-statement neighbours, for fee detection by shared reference.
    prisma.bankTransaction.findMany({
      where: { accountId: { in: [...new Set(lines.map((l) => l.accountId))] }, postedAt: { gte: new Date(minT - 86_400_000), lte: new Date(maxT + 86_400_000) } },
      select: { id: true, accountId: true, postedAt: true, amountCents: true, description: true, counterparty: true, reference: true },
    }),
    // Pending lines of every account of these entities: the other leg of a transfer.
    prisma.bankTransaction.findMany({
      where: { status: "PENDING", account: { active: true, sede: { in: sedes } }, postedAt: { gte: new Date(minT - 4 * 86_400_000), lte: new Date(maxT + 4 * 86_400_000) } },
      select: { id: true, accountId: true, postedAt: true, amountCents: true, description: true, counterparty: true, reference: true, account: { select: { name: true, sede: true } } },
    }),
    // Net salaries not matched to a debit yet (cash-paid roles are settled).
    prisma.payrollLine.findMany({
      where: {
        bankTransactionId: null,
        netCents: { gt: 0 },
        run: { sede: { in: sedes }, status: { in: ["APPROVED", "PAID"] }, NOT: { paidMethod: "CASH" } },
      },
      include: { run: { select: { sede: true, period: true } }, employee: { select: { firstName: true, lastName: true } } },
    }),
    prisma.payrollRun.groupBy({ by: ["sede"], where: { sede: { in: sedes }, status: { in: ["APPROVED", "PAID"] } }, _count: { _all: true } }),
  ]);

  // IESS / SRI proposals, one per entity and month (only for lines that need them).
  const dues = new Map<string, Promise<LiabilityDue | null>>();
  const dueFor = (sede: Sede, l: { postedAt: Date; amountCents: number; description: string; counterparty: string | null }) => {
    if (l.amountCents >= 0) return Promise.resolve(null);
    const text = `${l.description} ${l.counterparty ?? ""}`;
    const to: LiabilityTo | null = isSriDebit(text) ? "SRI" : isIessDebit(text) ? "IESS" : null;
    if (!to) return Promise.resolve(null);
    const key = `${sede}|${to}|${duePeriod(l.postedAt)}`;
    if (!dues.has(key)) dues.set(key, liabilityDue(sede, to, duePeriod(l.postedAt)));
    return dues.get(key)!;
  };
  const lineDues = await Promise.all(lines.map((l) => dueFor(l.account.sede, l)));

  const cands = (sede: Sede): CandidatePayment[] =>
    payments
      .filter((p) => p.sede === sede)
      .map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        paidAt: p.paidAt,
        memberName: p.member ? `${p.member.firstName} ${p.member.lastName}` : "",
        depositorName: p.depositorName,
        method: p.method,
      }));

  const payrollFor = (sede: Sede): PayrollCandidate[] =>
    payrollLines
      .filter((p) => p.run.sede === sede)
      .map((p) => ({ id: p.id, runId: p.runId, period: p.run.period, employeeName: `${p.employee.firstName} ${p.employee.lastName}`, netCents: p.netCents }));

  return lines.map((l, i) => {
    const line: LineIn = {
      id: l.id, postedAt: l.postedAt, amountCents: l.amountCents,
      description: l.description, counterparty: l.counterparty, reference: l.reference,
    };
    const sede = l.account.sede;
    const payroll = l.amountCents < 0 ? payrollFor(sede) : [];
    const due = lineDues[i];
    const { suggestion, candidates } = suggest(line, {
      sede,
      accountKind: l.account.kind,
      rules,
      candidates: cands(sede),
      siblings: siblings.filter((s) => s.accountId === l.accountId),
      otherAccounts: others
        .filter((o) => o.account.sede === sede && o.accountId !== l.accountId)
        .map((o) => ({ ...o, accountName: o.account.name })),
      payroll,
      due,
      hasPayroll: runsBySede.some((r) => r.sede === sede),
    });
    return { ...line, accountId: l.accountId, accountName: l.account.name, sede, suggestion, candidates, payroll, due };
  });
}

// ── Classification ──────────────────────────────────────────────────────────

type Applied = {
  decision: Decision;
  payments?: { id: string; status: PaymentStatus; reconciledAt: string | null; bankReference: string | null; bankEntity: string | null }[];
  poolPaymentId?: string;
  expenseIds?: string[];
  linkedExpenseId?: string;
  otherIncomeId?: string;
  capitalId?: string;
  ruleId?: string;
  /** Rol lines this debit paid, and the run's state before (to undo exactly). */
  payrollLineIds?: string[];
  runs?: { id: string; status: string; paidAt: string | null; paidMethod: ExpensePayMethod | null }[];
};

function txnKind(d: Decision): BankTxnKind | null {
  switch (d.type) {
    case "MEMBER_PAYMENTS": return d.commission ? "CARD_SETTLEMENT" : "MEMBER_PAYMENT";
    case "UNASSIGNED_DEPOSIT": return "MEMBER_PAYMENT";
    case "OTHER_INCOME": return "OTHER_INCOME";
    case "EXPENSE": return "EXPENSE";
    case "CAPITAL": return "CAPITAL";
    case "LOAN_PAYMENT": return "LOAN_PAYMENT";
    case "PAYROLL_NET": return "PAYROLL";
    case "LIABILITY_PAYMENT": return d.to === "SRI" ? "TAXES" : "PAYROLL";
    case "PERSONAL": return "PERSONAL";
    case "INTERNAL_TRANSFER": return "INTERNAL_TRANSFER";
    case "IGNORE": return null;
  }
}

function payMethodFor(description: string, category: string): ExpensePayMethod {
  if (/compra|tarjeta debito|pos\b/i.test(description)) return "DEBIT_CARD";
  if (category === "BANK_FEES" || category === "TAXES" || /d[eé]bito/i.test(description)) return "BANK_DEBIT";
  return "BANK_TRANSFER";
}

export async function classifyInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  txnId: string,
  decision: Decision,
  remember?: { pattern: string },
) {
  const line = await tx.bankTransaction.findUnique({ where: { id: txnId }, include: { account: true } });
  if (!line) throw new Error("Movimiento no encontrado.");
  if (line.status !== "PENDING") throw new Error("Este movimiento ya fue clasificado.");
  const { sede } = line.account;
  await assertOpen(tx, sede, ecDay(line.postedAt));
  const credit = line.amountCents > 0;
  const abs = Math.abs(line.amountCents);
  const day = ecDay(line.postedAt);
  const applied: Applied = { decision };

  switch (decision.type) {
    case "MEMBER_PAYMENTS": {
      if (!credit) throw new Error("Un débito no puede ser pago de socio.");
      if (decision.paymentIds.length === 0) throw new Error("Elige al menos un pago.");
      const pays = await tx.payment.findMany({ where: { id: { in: decision.paymentIds } } });
      if (pays.length !== decision.paymentIds.length) throw new Error("Algún pago ya no existe.");
      for (const p of pays) {
        if (p.sede !== sede) throw new Error("Hay un pago de otra sede.");
        if (p.bankTransactionId) throw new Error("Hay un pago que ya está conciliado con otro movimiento.");
        if (p.isPoolEntry || !p.memberId) throw new Error("Solo pagos de socios.");
      }
      const sum = pays.reduce((s, p) => s + p.amountCents, 0);
      if (sum !== abs) {
        if (!(decision.commission && sum > abs)) {
          throw new Error(`Los pagos suman $${(sum / 100).toFixed(2)} y el depósito es $${(abs / 100).toFixed(2)}.`);
        }
        // Card settlement arrives net: the difference is the processor's fee.
        const fee = await tx.expense.create({
          data: {
            sede, category: "BANK_FEES", description: "Comisión de tarjeta (Pagoplux)",
            amountCents: sum - abs, date: day, paidAt: day, status: "PAID", paymentMethod: "BANK_DEBIT",
            bankTransactionId: line.id, createdById: userId,
          },
        });
        applied.expenseIds = [fee.id];
      }
      applied.payments = pays.map((p) => ({
        id: p.id, status: p.status, reconciledAt: p.reconciledAt?.toISOString() ?? null,
        bankReference: p.bankReference, bankEntity: p.bankEntity,
      }));
      for (const p of pays) {
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status: "SUCCEEDED",
            reconciledAt: new Date(),
            bankTransactionId: line.id,
            bankReference: p.bankReference ?? line.reference,
            bankEntity: p.bankEntity ?? line.account.bank,
          },
        });
      }
      break;
    }
    case "UNASSIGNED_DEPOSIT": {
      if (!credit) throw new Error("Solo para créditos.");
      // Goes to Pagos › Sin asignar, where reception assigns it to the socio.
      const pool = await tx.payment.create({
        data: {
          isPoolEntry: true, status: "PENDING", sede, amountCents: abs, method: "BANK_TRANSFER",
          paidAt: day, depositorName: line.counterparty, bankReference: line.reference,
          bankEntity: line.account.bank, bankTransactionId: line.id, reconciledAt: new Date(),
          recordedByUserId: userId, notes: "Del estado de cuenta (Finanzas)",
        },
      });
      applied.poolPaymentId = pool.id;
      break;
    }
    case "OTHER_INCOME": {
      if (!credit) throw new Error("Solo para créditos.");
      const o = await tx.otherIncome.create({
        data: { sede, category: decision.category, description: decision.description || line.description, amountCents: abs, date: day, bankTransactionId: line.id, createdById: userId },
      });
      applied.otherIncomeId = o.id;
      break;
    }
    case "EXPENSE": {
      if (credit) throw new Error("Un crédito no puede ser gasto.");
      // One expense, two sources: if an unpaid/unlinked expense with the same
      // amount exists (cuenta por pagar, SRI invoice), link it instead.
      const existing = await tx.expense.findMany({
        where: {
          sede, amountCents: abs, voidedAt: null, bankTransactionId: null,
          date: { gte: new Date(day.getTime() - 45 * 86_400_000), lte: new Date(day.getTime() + 5 * 86_400_000) },
        },
        take: 2,
      });
      if (existing.length === 1) {
        const e = existing[0];
        await tx.expense.update({
          where: { id: e.id },
          data: { bankTransactionId: line.id, status: "PAID", paidAt: e.paidAt ?? day, paymentMethod: e.paymentMethod ?? payMethodFor(line.description, e.category) },
        });
        applied.linkedExpenseId = e.id;
      } else {
        const e = await tx.expense.create({
          data: {
            sede, category: decision.category, description: decision.description || line.description,
            supplierId: await resolveSupplier(tx, { name: decision.supplierName }),
            supplierName: decision.supplierName || null, amountCents: abs, date: day, paidAt: day, status: "PAID",
            paymentMethod: payMethodFor(line.description, decision.category), bankTransactionId: line.id, createdById: userId,
            isPrivate: PRIVATE_CATEGORIES.includes(decision.category),
          },
        });
        applied.expenseIds = [e.id];
      }
      break;
    }
    case "CAPITAL": {
      const inflow = decision.kind === "CONTRIBUTION" || decision.kind === "SHAREHOLDER_LOAN";
      if (inflow !== credit) throw new Error(inflow ? "Un aporte o préstamo debe ser un crédito." : "Una devolución o retiro debe ser un débito.");
      if (sede === "FITNESS_CENTER" && (decision.kind === "SHAREHOLDER_LOAN" || decision.kind === "LOAN_REPAYMENT")) {
        throw new Error("La Fitness es persona natural: usa Aporte o Retiro.");
      }
      if (sede === "XTREME" && decision.kind === "WITHDRAWAL") throw new Error("En la S.A.S. usa devolución de préstamo.");
      const c = await tx.capitalMovement.create({
        data: { sede, kind: decision.kind, person: decision.person, amountCents: abs, date: day, bankTransactionId: line.id, createdById: userId, notes: line.description },
      });
      applied.capitalId = c.id;
      break;
    }
    case "LOAN_PAYMENT": {
      if (credit) throw new Error("Una cuota es un débito.");
      if (decision.interestCents < 0 || decision.interestCents > abs) throw new Error("El interés no puede superar la cuota.");
      if (decision.interestCents < abs) {
        // The principal reduces a liability: posted from the bank line (BANK entry).
        const acct = decision.principalCode
          ? await tx.ledgerAccount.findUnique({ where: { sede_code: { sede, code: decision.principalCode } } })
          : null;
        if (!acct || acct.type !== "LIABILITY" || !acct.postable) throw new Error("Elige el préstamo (cuenta de pasivo) al que se abona el capital.");
      }
      if (decision.interestCents > 0) {
        const e = await tx.expense.create({
          data: {
            sede, category: "INTEREST", description: `Intereses · ${line.description}`, amountCents: decision.interestCents,
            date: day, paidAt: day, status: "PAID", paymentMethod: "BANK_DEBIT", bankTransactionId: line.id, createdById: userId,
          },
        });
        applied.expenseIds = [e.id];
      }
      break;
    }
    case "PAYROLL_NET": {
      if (credit) throw new Error("Un pago de sueldos es un débito.");
      if (decision.lineIds.length === 0) throw new Error("Elige a quién se le pagó.");
      const rows = await tx.payrollLine.findMany({ where: { id: { in: decision.lineIds } }, include: { run: true } });
      if (rows.length !== decision.lineIds.length) throw new Error("Alguna línea del rol ya no existe.");
      for (const r of rows) {
        if (r.run.sede !== sede) throw new Error("Hay una línea del rol de otra empresa.");
        if (r.run.status !== "APPROVED" && r.run.status !== "PAID") throw new Error(`El rol ${r.run.period} no está aprobado.`);
        if (r.bankTransactionId) throw new Error("Hay un sueldo que ya está enlazado con otro movimiento.");
      }
      const sum = rows.reduce((a, r) => a + r.netCents, 0);
      if (sum !== abs) throw new Error(`Los sueldos suman $${(sum / 100).toFixed(2)} y el débito es $${(abs / 100).toFixed(2)}.`);
      await tx.payrollLine.updateMany({ where: { id: { in: decision.lineIds } }, data: { bankTransactionId: line.id } });
      applied.payrollLineIds = decision.lineIds;
      applied.runs = [];
      // A rol whose every net salary is now matched is paid.
      for (const run of new Map(rows.map((r) => [r.runId, r.run])).values()) {
        const open = await tx.payrollLine.count({ where: { runId: run.id, netCents: { gt: 0 }, bankTransactionId: null } });
        if (open === 0 && run.status !== "PAID") {
          applied.runs.push({ id: run.id, status: run.status, paidAt: run.paidAt?.toISOString() ?? null, paidMethod: run.paidMethod });
          await tx.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidAt: day, paidMethod: "BANK_TRANSFER" } });
        }
      }
      break;
    }
    case "LIABILITY_PAYMENT": {
      if (credit) throw new Error("Un pago al IESS o al SRI es un débito.");
      if (!/^\d{4}-\d{2}$/.test(decision.period)) throw new Error("Mes inválido.");
      const allowed = LIABILITY_CODES[decision.to];
      if (decision.extraCents < 0) throw new Error("Intereses y multas no pueden ser negativos.");
      for (const p of decision.parts) {
        if (!allowed.includes(p.code)) throw new Error(`La cuenta ${p.code} no se paga al ${decision.to}.`);
        if (!Number.isInteger(p.cents) || (p.cents < 0 && p.code !== "1.3.01")) throw new Error("Montos inválidos.");
      }
      const total = decision.parts.reduce((a, p) => a + p.cents, 0) + decision.extraCents;
      if (total !== abs) throw new Error(`El desglose suma $${(total / 100).toFixed(2)} y el débito es $${(abs / 100).toFixed(2)}.`);
      if (decision.parts.reduce((a, p) => a + p.cents, 0) < 0) throw new Error("El desglose no puede ser negativo.");
      if (decision.extraCents > 0) {
        const e = await tx.expense.create({
          data: {
            sede, category: decision.to === "SRI" ? "TAXES" : "OTHER",
            description: `Intereses y multas ${decision.to} · ${decision.period}`, amountCents: decision.extraCents,
            date: day, paidAt: day, status: "PAID", paymentMethod: "BANK_DEBIT", bankTransactionId: line.id, createdById: userId,
          },
        });
        applied.expenseIds = [e.id];
      }
      break;
    }
    case "PERSONAL":
    case "INTERNAL_TRANSFER":
    case "IGNORE":
      break;
  }

  const learnable = ["EXPENSE", "OTHER_INCOME", "CAPITAL", "PERSONAL", "INTERNAL_TRANSFER"].includes(decision.type);
  if (remember?.pattern.trim() && learnable) {
    const label: RuleLabel =
      decision.type === "EXPENSE" ? { description: decision.description }
      : decision.type === "OTHER_INCOME" ? { description: decision.description, otherCategory: decision.category }
      : decision.type === "CAPITAL" ? { person: decision.person, capitalKind: decision.kind }
      : {};
    const rule = await tx.bankRule.create({
      data: {
        pattern: remember.pattern.trim(),
        direction: credit ? 1 : -1,
        kind: txnKind(decision)!,
        category: decision.type === "EXPENSE" ? decision.category : null,
        sede,
        label: JSON.stringify(label),
      },
    });
    applied.ruleId = rule.id;
  }

  await tx.bankTransaction.update({
    where: { id: line.id },
    data: {
      status: decision.type === "IGNORE" ? "IGNORED" : "CLASSIFIED",
      kind: txnKind(decision),
      appliedJson: applied as unknown as Prisma.InputJsonValue,
      classifiedAt: new Date(),
      classifiedById: userId,
    },
  });
}

export async function undoInTx(tx: Prisma.TransactionClient, txnId: string) {
    const line = await tx.bankTransaction.findUnique({ where: { id: txnId } });
    if (!line || line.status === "PENDING") throw new Error("No hay nada que deshacer.");
    const acct = await tx.bankAccount.findUniqueOrThrow({ where: { id: line.accountId }, select: { sede: true } });
    await assertOpen(tx, acct.sede, ecDay(line.postedAt));
    const a = (line.appliedJson ?? {}) as unknown as Applied;

    for (const p of a.payments ?? []) {
      await tx.payment.update({
        where: { id: p.id },
        data: {
          status: p.status,
          reconciledAt: p.reconciledAt ? new Date(p.reconciledAt) : null,
          bankReference: p.bankReference,
          bankEntity: p.bankEntity,
          bankTransactionId: null,
        },
      });
    }
    if (a.poolPaymentId) {
      const pool = await tx.payment.findUnique({ where: { id: a.poolPaymentId } });
      if (pool && (!pool.isPoolEntry || pool.status !== "PENDING")) {
        throw new Error("Recepción ya asignó ese depósito a un socio: deshazlo primero en Pagos.");
      }
      // Never DELETE: mark the pool entry as failed so it leaves "Sin asignar".
      await tx.payment.update({
        where: { id: a.poolPaymentId },
        data: { status: "FAILED", bankTransactionId: null, notes: "Anulado al deshacer la conciliación" },
      });
    }
    for (const id of a.expenseIds ?? []) {
      await tx.expense.update({ where: { id }, data: { voidedAt: new Date(), voidReason: "Deshacer conciliación", bankTransactionId: null } });
    }
    if (a.linkedExpenseId) {
      await tx.expense.update({ where: { id: a.linkedExpenseId }, data: { bankTransactionId: null } });
    }
    if (a.otherIncomeId) {
      await tx.otherIncome.update({ where: { id: a.otherIncomeId }, data: { voidedAt: new Date(), bankTransactionId: null } });
    }
    if (a.capitalId) {
      await tx.capitalMovement.update({ where: { id: a.capitalId }, data: { voidedAt: new Date(), bankTransactionId: null } });
    }
    if (a.payrollLineIds?.length) {
      await tx.payrollLine.updateMany({ where: { id: { in: a.payrollLineIds }, bankTransactionId: txnId }, data: { bankTransactionId: null } });
    }
    for (const r of a.runs ?? []) {
      await tx.payrollRun.update({
        where: { id: r.id },
        data: { status: r.status as "APPROVED" | "PAID", paidAt: r.paidAt ? new Date(r.paidAt) : null, paidMethod: r.paidMethod },
      });
    }
    // Learned rules stay: they can be switched off in the rules list.
    await tx.bankTransaction.update({
      where: { id: txnId },
      data: { status: "PENDING", kind: null, appliedJson: Prisma.DbNull, classifiedAt: null, classifiedById: null },
    });
}
