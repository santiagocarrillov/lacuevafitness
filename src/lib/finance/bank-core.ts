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
  suggest,
  type CandidatePayment,
  type Decision,
  type LineIn,
  type RuleLabel,
  type ScoredCandidate,
  type Suggestion,
} from "@/lib/finance/bank-suggest";
import { assertOpen } from "@/lib/accounting/posting";

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
};

export async function buildInbox(filter: { accountId?: string; importBatch?: string }, limit = 300): Promise<InboxLine[]> {
  const lines = await prisma.bankTransaction.findMany({
    where: { status: "PENDING", account: { active: true }, ...filter },
    include: { account: true },
    orderBy: [{ postedAt: "asc" }],
    take: limit,
  });
  if (lines.length === 0) return [];

  const sedes = [...new Set(lines.map((l) => l.account.sede))];
  const minT = Math.min(...lines.map((l) => l.postedAt.getTime()));
  const maxT = Math.max(...lines.map((l) => l.postedAt.getTime()));

  const [rules, payments, siblings] = await Promise.all([
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
  ]);

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

  return lines.map((l) => {
    const line: LineIn = {
      id: l.id, postedAt: l.postedAt, amountCents: l.amountCents,
      description: l.description, counterparty: l.counterparty, reference: l.reference,
    };
    const { suggestion, candidates } = suggest(line, {
      sede: l.account.sede,
      accountKind: l.account.kind,
      rules,
      candidates: cands(l.account.sede),
      siblings: siblings.filter((s) => s.accountId === l.accountId),
    });
    return { ...line, accountId: l.accountId, accountName: l.account.name, sede: l.account.sede, suggestion, candidates };
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
};

function txnKind(d: Decision): BankTxnKind | null {
  switch (d.type) {
    case "MEMBER_PAYMENTS": return d.commission ? "CARD_SETTLEMENT" : "MEMBER_PAYMENT";
    case "UNASSIGNED_DEPOSIT": return "MEMBER_PAYMENT";
    case "OTHER_INCOME": return "OTHER_INCOME";
    case "EXPENSE": return "EXPENSE";
    case "CAPITAL": return "CAPITAL";
    case "LOAN_PAYMENT": return "LOAN_PAYMENT";
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
    case "PERSONAL":
    case "INTERNAL_TRANSFER":
    case "IGNORE":
      break;
  }

  if (remember?.pattern.trim() && decision.type !== "MEMBER_PAYMENTS" && decision.type !== "UNASSIGNED_DEPOSIT" && decision.type !== "LOAN_PAYMENT" && decision.type !== "IGNORE") {
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
    // Learned rules stay: they can be switched off in the rules list.
    await tx.bankTransaction.update({
      where: { id: txnId },
      data: { status: "PENDING", kind: null, appliedJson: Prisma.DbNull, classifiedAt: null, classifiedById: null },
    });
}
