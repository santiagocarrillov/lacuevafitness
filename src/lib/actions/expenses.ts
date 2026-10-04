"use server";

// Gastos (Módulo 3): QuickBooks-style expenses with lines, receipt reading by
// AI, and front-desk access. OWNER/ACCOUNTING see everything; an ADMIN works
// only on their sede and never sees or records personnel costs (5.2.x).
// Design: docs/gastos-modulo3.md. Expenses are voided, never deleted.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertOpen } from "@/lib/accounting/posting";
import { uploadFinanceDoc, signFinanceDoc } from "@/lib/storage/upload";
import { ENTITIES, entityForBuyer, monthRangeUtc } from "@/lib/finance/entities";
import { isValidAccessKey } from "@/lib/finance/sri-xml";
import { readReceipt, type ReceiptReading } from "@/lib/expenses/ocr";
import {
  ASSET_LINE_CODES,
  expenseTotals,
  hasIvaCredit,
  headerCategory,
  isPrivateCode,
  lineAccounts,
  type ExpenseLineInput,
} from "@/lib/expenses/core";
import type { ExpenseCategory, ExpenseDocType, ExpensePayMethod, Prisma, Sede, User } from "@/generated/prisma/client";

const PATH = "/dashboard/gastos";
const SEDES: Sede[] = ["FITNESS_CENTER", "XTREME"];
const DOC_TYPES: ExpenseDocType[] = ["FACTURA", "NOTA_VENTA", "LIQUIDACION_COMPRA", "RECIBO", "SIN_DOCUMENTO"];
const PAY_METHODS: ExpensePayMethod[] = ["CASH", "BANK_TRANSFER", "BANK_DEBIT", "DEBIT_CARD", "CREDIT_CARD", "OTHER"];

type Access = { user: User; full: boolean; sede: Sede | null };

async function requireExpenses(): Promise<Access> {
  const user = await requireAuth();
  if (user.role === "OWNER" || user.role === "ACCOUNTING") return { user, full: true, sede: null };
  if (user.role === "ADMIN" && user.sede) return { user, full: false, sede: user.sede };
  throw new Error("No autorizado");
}

function assertSede(acc: Access, sede: Sede) {
  if (!SEDES.includes(sede)) throw new Error("Entidad inválida.");
  if (acc.sede && acc.sede !== sede) throw new Error("Solo puedes registrar gastos de tu sede.");
}

/** What a user may see: admins → their sede, never private expenses. */
function visibleWhere(acc: Access): Prisma.ExpenseWhereInput {
  return acc.full ? {} : { sede: acc.sede!, isPrivate: false };
}

async function accountsFor(acc: Access, sede: Sede) {
  const all = await prisma.ledgerAccount.findMany({
    where: { sede, active: true },
    select: { id: true, code: true, name: true, type: true, postable: true, expenseCategory: true },
  });
  return lineAccounts(all, { includePrivate: acc.full });
}

export async function getLineAccounts(sede: Sede) {
  const acc = await requireExpenses();
  assertSede(acc, sede);
  return (await accountsFor(acc, sede)).map((a) => ({ code: a.code, name: a.name }));
}

// ── Receipt reading ─────────────────────────────────────────────────────────

export type ReceiptResult = {
  receiptPath: string;
  reading: ReceiptReading;
  warnings: string[];
};

const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** Stores the receipt privately and reads it with AI. Nothing is recorded yet. */
export async function readReceiptAction(fd: FormData): Promise<ReceiptResult> {
  const acc = await requireExpenses();
  const sede = fd.get("sede") as Sede;
  assertSede(acc, sede);
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Elige la foto o el PDF del comprobante.");
  if (!RECEIPT_TYPES.includes(file.type)) throw new Error("El comprobante debe ser foto (JPG, PNG, WebP) o PDF.");

  const receiptPath = await uploadFinanceDoc(file, `expenses/${sede}`);
  const accounts = await accountsFor(acc, sede);
  const reading = await readReceipt({ data: Buffer.from(await file.arrayBuffer()), mediaType: file.type }, accounts.map((a) => ({ code: a.code, name: a.name })));

  const warnings: string[] = [];
  if (!reading.readable) warnings.push("La IA no reconoce esto como un comprobante de compra: revisa todo a mano.");
  // Same supplier as before → reuse the account they were filed under.
  if (reading.supplierRuc && reading.lines.length === 1) {
    const prev = await prisma.expenseLine.findFirst({
      where: { expense: { supplierRuc: reading.supplierRuc, sede, voidedAt: null } },
      orderBy: { expense: { date: "desc" } },
      include: { account: { select: { code: true } } },
    });
    if (prev && accounts.some((a) => a.code === prev.account.code) && prev.account.code !== reading.lines[0].accountCode) {
      reading.lines[0].accountCode = prev.account.code;
      warnings.push("Cuenta tomada del último gasto de este proveedor.");
    }
  }
  if (reading.buyerId) {
    const buyer = entityForBuyer(reading.buyerId);
    if (buyer && buyer !== sede) warnings.push(`El comprobante está a nombre de ${ENTITIES[buyer].name}, no de ${ENTITIES[sede].name}.`);
    if (!buyer && reading.documentType === "FACTURA") warnings.push(`La factura no está a nombre de la entidad (comprador ${reading.buyerId}): no da crédito de IVA ni es deducible.`);
  }
  if (reading.accessKey && isValidAccessKey(reading.accessKey)) {
    const dup = await prisma.expense.findUnique({ where: { sriAccessKey: reading.accessKey }, select: { id: true, voidedAt: true } });
    if (dup && !dup.voidedAt) warnings.push("Esta factura ya está registrada (misma clave de acceso).");
  } else if (reading.supplierRuc && reading.documentNumber) {
    const dup = await prisma.expense.findFirst({
      where: { supplierRuc: reading.supplierRuc, documentNumber: reading.documentNumber, voidedAt: null },
      select: { id: true },
    });
    if (dup) warnings.push("Ya hay un gasto con este proveedor y número de documento.");
  }
  const t = expenseTotals(reading.lines);
  if (t.totalCents !== reading.totalCents) warnings.push(`Las líneas suman $${(t.totalCents / 100).toFixed(2)} y el total leído es $${(reading.totalCents / 100).toFixed(2)}: revisa.`);
  return { receiptPath, reading, warnings };
}

export async function getReceiptUrl(expenseId: string) {
  const acc = await requireExpenses();
  const e = await prisma.expense.findFirst({ where: { id: expenseId, ...visibleWhere(acc) }, select: { receiptPath: true } });
  return e?.receiptPath ? signFinanceDoc(e.receiptPath) : null;
}

export async function getUploadedReceiptUrl(path: string) {
  await requireExpenses();
  if (!/^expenses\/(FITNESS_CENTER|XTREME)\/[\w-]+\.(jpg|png|webp|pdf)$/.test(path)) throw new Error("Ruta inválida.");
  return signFinanceDoc(path);
}

// ── Save ────────────────────────────────────────────────────────────────────

export type ExpenseDraft = {
  id?: string;
  sede: Sede;
  supplierName: string;
  supplierRuc?: string;
  documentType: ExpenseDocType;
  documentNumber?: string;
  accessKey?: string;
  date: string; // YYYY-MM-DD
  paid: boolean;
  paymentMethod?: ExpensePayMethod;
  paidAt?: string;
  dueDate?: string;
  notes?: string;
  receiptPath?: string | null;
  lines: ExpenseLineInput[];
};

const day = (v: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label}: fecha inválida.`);
  return new Date(`${v}T00:00:00.000Z`);
};

export async function saveExpense(input: ExpenseDraft): Promise<{ id: string }> {
  const acc = await requireExpenses();
  assertSede(acc, input.sede);
  const date = day(input.date, "Fecha");
  await assertOpen(prisma, input.sede, date);

  if (!DOC_TYPES.includes(input.documentType)) throw new Error("Tipo de documento inválido.");
  const supplierName = input.supplierName.trim();
  if (!supplierName) throw new Error("Escribe el proveedor.");
  const supplierRuc = input.supplierRuc?.trim() || null;
  if (supplierRuc && !/^\d{10}(\d{3})?$/.test(supplierRuc)) throw new Error("RUC/cédula del proveedor: 10 o 13 dígitos.");
  const documentNumber = input.documentNumber?.trim() || null;
  if (documentNumber && !/^\d{3}-\d{3}-\d{1,9}$/.test(documentNumber)) throw new Error("Número de documento con formato 001-001-000000123.");
  const accessKey = input.accessKey?.trim() || null;
  if (accessKey && !isValidAccessKey(accessKey)) throw new Error("La clave de acceso no es válida (49 dígitos).");
  if (input.receiptPath && !input.receiptPath.startsWith(`expenses/${input.sede}/`)) throw new Error("Comprobante inválido.");

  // Lines → accounts the user may use.
  if (!input.lines.length) throw new Error("Agrega al menos una línea.");
  const allowed = new Map((await accountsFor(acc, input.sede)).map((a) => [a.code, a]));
  const credit = hasIvaCredit(input.documentType);
  const lines = input.lines.map((l, i) => {
    const a = allowed.get(l.accountCode);
    if (!a) throw new Error(`Línea ${i + 1}: elige una cuenta válida.`);
    if (!l.description.trim()) throw new Error(`Línea ${i + 1}: escribe qué se compró.`);
    if (!Number.isInteger(l.subtotalCents) || l.subtotalCents <= 0) throw new Error(`Línea ${i + 1}: monto inválido.`);
    if (!Number.isInteger(l.ivaCents) || l.ivaCents < 0) throw new Error(`Línea ${i + 1}: IVA inválido.`);
    // Without a factura the IVA is part of the cost.
    const sub = credit ? l.subtotalCents : l.subtotalCents + l.ivaCents;
    return { account: a, description: l.description.trim(), subtotalCents: sub, ivaRate: credit ? l.ivaRate : 0, ivaCents: credit ? l.ivaCents : 0 };
  });
  const totals = expenseTotals(lines.map((l) => ({ ...l, accountCode: l.account.code })));
  const isPrivate = lines.some((l) => isPrivateCode(l.account.code));
  const category = headerCategory(lines.map((l) => ({ subtotalCents: l.subtotalCents, category: l.account.expenseCategory, isAsset: ASSET_LINE_CODES.includes(l.account.code) })));
  const description = lines.length === 1 ? lines[0].description : `${lines[0].description} y ${lines.length - 1} más`;

  const paymentMethod = input.paid ? (input.paymentMethod ?? "CASH") : null;
  if (paymentMethod && !PAY_METHODS.includes(paymentMethod)) throw new Error("Forma de pago inválida.");
  const paidAt = input.paid ? (input.paidAt ? day(input.paidAt, "Fecha de pago") : date) : null;
  if (paidAt) await assertOpen(prisma, input.sede, paidAt);

  const data = {
    sede: input.sede,
    category,
    description: description.slice(0, 200),
    amountCents: totals.totalCents,
    subtotalCents: totals.subtotalCents,
    ivaCents: totals.ivaCents,
    date,
    supplierName,
    supplierRuc,
    documentType: input.documentType,
    documentNumber,
    sriAccessKey: accessKey,
    status: input.paid ? ("PAID" as const) : ("PENDING" as const),
    paidAt,
    dueDate: input.paid ? null : input.dueDate ? day(input.dueDate, "Vencimiento") : null,
    paymentMethod,
    notes: input.notes?.trim() || null,
    isPrivate,
    // An admin's entry waits for Isabel; hers counts as reviewed.
    reviewedAt: acc.full ? new Date() : null,
    reviewedById: acc.full ? acc.user.id : null,
  };
  const lineRows = lines.map((l, i) => ({
    position: i + 1,
    description: l.description,
    accountId: l.account.id,
    subtotalCents: l.subtotalCents,
    ivaRate: l.ivaRate,
    ivaCents: l.ivaCents,
  }));

  if (accessKey) {
    const dup = await prisma.expense.findUnique({ where: { sriAccessKey: accessKey }, select: { id: true } });
    if (dup && dup.id !== input.id) throw new Error("Esa factura ya está registrada (misma clave de acceso).");
  }

  const id = await prisma.$transaction(async (tx) => {
    if (input.id) {
      const cur = await tx.expense.findUniqueOrThrow({ where: { id: input.id } });
      if (cur.voidedAt) throw new Error("El gasto está anulado.");
      if (!acc.full && (cur.sede !== acc.sede || cur.isPrivate || cur.createdById !== acc.user.id || cur.reviewedAt)) {
        throw new Error("Solo puedes corregir tus gastos que todavía no se han revisado.");
      }
      await assertOpen(tx, cur.sede, cur.date);
      // Lines are updated in place by position, so a line already in the
      // fixed-asset register keeps its link; extra old lines are removed.
      const old = await tx.expenseLine.findMany({ where: { expenseId: cur.id }, include: { fixedAsset: { select: { id: true } } }, orderBy: { position: "asc" } });
      const removed = old.slice(lineRows.length);
      if (removed.some((l) => l.fixedAsset)) throw new Error("Una de las líneas que quitaste ya está registrada como activo fijo.");
      await tx.expenseLine.deleteMany({ where: { id: { in: removed.map((l) => l.id) } } });
      for (const [i, row] of lineRows.entries()) {
        if (old[i]) await tx.expenseLine.update({ where: { id: old[i].id }, data: row });
        else await tx.expenseLine.create({ data: { ...row, expenseId: cur.id } });
      }
      await tx.expense.update({ where: { id: cur.id }, data: { ...data, receiptPath: input.receiptPath ?? cur.receiptPath } });
      return cur.id;
    }
    const e = await tx.expense.create({
      data: { ...data, receiptPath: input.receiptPath ?? null, createdById: acc.user.id, lines: { create: lineRows } },
    });
    return e.id;
  });
  revalidatePath(PATH);
  revalidatePath("/dashboard/finanzas", "layout");
  return { id };
}

// ── List, review, void ──────────────────────────────────────────────────────

export type ExpenseFilters = {
  pendingReview?: boolean;
  payables?: boolean; // unpaid, any month
  sede?: Sede;
  category?: ExpenseCategory;
  docType?: ExpenseDocType;
};

export async function listExpensesScoped(ym: string, opts: ExpenseFilters = {}) {
  const acc = await requireExpenses();
  const { start, end } = monthRangeUtc(ym);
  const rows = await prisma.expense.findMany({
    where: {
      ...visibleWhere(acc),
      ...(opts.pendingReview
        ? { reviewedAt: null, voidedAt: null }
        : opts.payables
          ? { status: "PENDING", voidedAt: null }
          : { date: { gte: start, lt: end } }),
      ...(opts.sede && acc.full ? { sede: opts.sede } : {}),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.docType ? { documentType: opts.docType } : {}),
    },
    include: { lines: { orderBy: { position: "asc" }, include: { account: { select: { code: true, name: true } } } } },
    orderBy: opts.payables ? [{ dueDate: "asc" }, { date: "asc" }] : [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))] } },
    select: { id: true, fullName: true },
  });
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({ ...r, createdByName: r.createdById ? name.get(r.createdById) ?? null : null }));
}

export async function countPendingReview() {
  const acc = await requireExpenses();
  if (!acc.full) return 0;
  return prisma.expense.count({ where: { reviewedAt: null, voidedAt: null } });
}

export async function getExpenseForEdit(id: string) {
  const acc = await requireExpenses();
  return prisma.expense.findFirst({
    where: { id, ...visibleWhere(acc) },
    include: { lines: { orderBy: { position: "asc" }, include: { account: { select: { code: true, name: true } } } } },
  });
}

export async function reviewExpense(id: string) {
  const acc = await requireExpenses();
  if (!acc.full) throw new Error("Solo Isabel o Santiago revisan gastos.");
  await prisma.expense.update({ where: { id, voidedAt: null }, data: { reviewedAt: new Date(), reviewedById: acc.user.id } });
  revalidatePath(PATH);
}

export async function voidExpenseScoped(id: string, reason: string) {
  const acc = await requireExpenses();
  if (!reason.trim()) throw new Error("Escribe el motivo.");
  const e = await prisma.expense.findUniqueOrThrow({ where: { id } });
  if (!acc.full && (e.sede !== acc.sede || e.isPrivate || e.createdById !== acc.user.id || e.reviewedAt)) {
    throw new Error("Solo puedes anular tus gastos que todavía no se han revisado.");
  }
  await assertOpen(prisma, e.sede, e.date);
  await prisma.expense.update({ where: { id, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
  revalidatePath(PATH);
  revalidatePath("/dashboard/finanzas", "layout");
}
