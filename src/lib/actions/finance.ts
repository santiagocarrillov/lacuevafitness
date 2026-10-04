"use server";

// Finanzas (Fase 1a): expenses, owner capital, other income and the monthly
// income statement per legal entity (entity = sede). Design: docs/finanzas-fase1.md
// Only OWNER/ACCOUNTING. Records are voided, never deleted.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { uploadFinanceDoc, signFinanceDoc } from "@/lib/storage/upload";
import { assertOpen } from "@/lib/accounting/posting";
import type {
  CapitalKind,
  ExpenseCategory,
  ExpenseDocType,
  ExpensePayMethod,
  OtherIncomeCategory,
  Sede,
} from "@/generated/prisma/client";
import { monthRangeUtc } from "@/lib/finance/entities";
import { PRIVATE_CATEGORIES } from "@/lib/expenses/core";
import {
  computeCapitalBalances,
  computeFinanceTrend,
  computeIncomeStatement,
  type CapitalBalance,
  type EntityStatement,
  type TrendRow,
} from "@/lib/finance/queries";

const PATH = "/dashboard/finanzas";

async function requireFinanceView() {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) throw new Error("No autorizado");
  return user;
}

async function requireFinanceEdit() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");
  return user;
}

// ── parsing helpers ─────────────────────────────────────────────────────────

const SEDES: Sede[] = ["FITNESS_CENTER", "XTREME"];

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v ? v : null;
}

function parseSede(v: string): Sede {
  if (!SEDES.includes(v as Sede)) throw new Error("Elige la entidad (sede).");
  return v as Sede;
}

/** "12.50" / "12,50" → 1250. Throws on invalid or non-positive amounts. */
function parseCents(v: string, label: string, { allowZero = false } = {}): number {
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) {
    throw new Error(`${label}: monto inválido.`);
  }
  return Math.round(n * 100);
}

function optCents(fd: FormData, key: string, label: string): number | null {
  const v = str(fd, key);
  return v ? parseCents(v, label, { allowZero: true }) : null;
}

/** "YYYY-MM-DD" → UTC-midnight Date (matches @db.Date). */
function parseDay(v: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label}: fecha inválida.`);
  return new Date(`${v}T00:00:00.000Z`);
}

function optDay(fd: FormData, key: string, label: string): Date | null {
  const v = str(fd, key);
  return v ? parseDay(v, label) : null;
}

// ── Income statement (logic in lib/finance/queries.ts) ─────────────────────

export async function getIncomeStatement(ym: string): Promise<EntityStatement[]> {
  await requireFinanceView();
  return computeIncomeStatement(ym);
}

export async function getFinanceTrend(ym: string, months = 12): Promise<TrendRow[]> {
  await requireFinanceView();
  return computeFinanceTrend(ym, months);
}

export async function getCapitalBalances(): Promise<CapitalBalance[]> {
  await requireFinanceView();
  return computeCapitalBalances();
}

// ── Expenses ────────────────────────────────────────────────────────────────

export async function listExpenses(ym: string, sede?: Sede) {
  await requireFinanceView();
  const { start, end } = monthRangeUtc(ym);
  return prisma.expense.findMany({
    where: { date: { gte: start, lt: end }, ...(sede ? { sede } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

/** Unpaid expenses (accounts payable) across all months. */
export async function listPayables() {
  await requireFinanceView();
  return prisma.expense.findMany({
    where: { voidedAt: null, status: "PENDING" },
    orderBy: [{ dueDate: "asc" }, { date: "asc" }],
  });
}

const DOC_TYPES: ExpenseDocType[] = ["FACTURA", "NOTA_VENTA", "LIQUIDACION_COMPRA", "RECIBO", "SIN_DOCUMENTO"];
const PAY_METHODS: ExpensePayMethod[] = ["CASH", "BANK_TRANSFER", "BANK_DEBIT", "DEBIT_CARD", "CREDIT_CARD", "OTHER"];
const CATEGORIES: ExpenseCategory[] = [
  "PAYROLL", "RENT", "UTILITIES", "EQUIPMENT", "MARKETING", "SUPPLIES",
  "SOFTWARE", "TAXES", "PROFESSIONAL", "BANK_FEES", "INTEREST", "COACH_FEES", "OTHER",
];

export async function createExpense(fd: FormData): Promise<{ id: string }> {
  const user = await requireFinanceEdit();

  const sede = parseSede(str(fd, "sede"));
  const category = str(fd, "category") as ExpenseCategory;
  if (!CATEGORIES.includes(category)) throw new Error("Elige la categoría.");
  const description = str(fd, "description");
  if (!description) throw new Error("Escribe una descripción.");
  const amountCents = parseCents(str(fd, "amount"), "Total");
  const ivaCents = optCents(fd, "iva", "IVA");
  if (ivaCents !== null && ivaCents > amountCents) throw new Error("El IVA no puede superar el total.");
  const date = parseDay(str(fd, "date"), "Fecha");
  await assertOpen(prisma, sede, date);

  const documentType = (str(fd, "documentType") || "SIN_DOCUMENTO") as ExpenseDocType;
  if (!DOC_TYPES.includes(documentType)) throw new Error("Tipo de documento inválido.");
  const supplierRuc = optStr(fd, "supplierRuc");
  if (supplierRuc && !/^\d{10}(\d{3})?$/.test(supplierRuc)) {
    throw new Error("RUC/cédula del proveedor: 10 o 13 dígitos.");
  }
  const documentNumber = optStr(fd, "documentNumber");
  if (documentNumber && !/^\d{3}-\d{3}-\d{1,9}$/.test(documentNumber)) {
    throw new Error("Número de documento con formato 001-001-000000123.");
  }

  const paid = str(fd, "status") !== "PENDING";
  const paymentMethod = (optStr(fd, "paymentMethod") ?? (paid ? "CASH" : null)) as ExpensePayMethod | null;
  if (paymentMethod && !PAY_METHODS.includes(paymentMethod)) throw new Error("Forma de pago inválida.");

  const file = fd.get("receipt");
  const receiptPath =
    file instanceof File && file.size > 0 ? await uploadFinanceDoc(file, `expenses/${sede}`) : null;

  const expense = await prisma.expense.create({
    data: {
      sede,
      category,
      description,
      amountCents,
      ivaCents,
      subtotalCents: ivaCents !== null ? amountCents - ivaCents : null,
      date,
      recurring: str(fd, "recurring") === "on",
      notes: optStr(fd, "notes"),
      supplierName: optStr(fd, "supplierName"),
      supplierRuc,
      documentType,
      documentNumber,
      status: paid ? "PAID" : "PENDING",
      paidAt: paid ? (optDay(fd, "paidAt", "Fecha de pago") ?? date) : null,
      dueDate: paid ? null : optDay(fd, "dueDate", "Vencimiento"),
      paymentMethod: paid ? paymentMethod : null,
      receiptPath,
      createdById: user.id,
      isPrivate: PRIVATE_CATEGORIES.includes(category),
      reviewedAt: new Date(),
      reviewedById: user.id,
    },
  });
  revalidatePath(PATH, "layout");
  return { id: expense.id };
}

export async function markExpensePaid(id: string, paidAt: string, method: ExpensePayMethod) {
  await requireFinanceEdit();
  if (!PAY_METHODS.includes(method)) throw new Error("Forma de pago inválida.");
  const e = await prisma.expense.findUniqueOrThrow({ where: { id }, select: { sede: true } });
  await assertOpen(prisma, e.sede, parseDay(paidAt, "Fecha de pago"));
  await prisma.expense.update({
    where: { id, voidedAt: null },
    data: { status: "PAID", paidAt: parseDay(paidAt, "Fecha de pago"), paymentMethod: method },
  });
  revalidatePath(PATH, "layout");
}

export async function voidExpense(id: string, reason: string) {
  await requireFinanceEdit();
  if (!reason.trim()) throw new Error("Indica el motivo de la anulación.");
  const ex = await prisma.expense.findUniqueOrThrow({ where: { id }, select: { sede: true, date: true, paidAt: true } });
  await assertOpen(prisma, ex.sede, ex.date);
  if (ex.paidAt) await assertOpen(prisma, ex.sede, ex.paidAt);
  await prisma.expense.update({
    where: { id, voidedAt: null },
    data: { voidedAt: new Date(), voidReason: reason.trim() },
  });
  revalidatePath(PATH, "layout");
}

export async function getExpenseReceiptUrl(id: string): Promise<string | null> {
  await requireFinanceView();
  const e = await prisma.expense.findUnique({ where: { id }, select: { receiptPath: true } });
  return e?.receiptPath ? signFinanceDoc(e.receiptPath) : null;
}

// ── Owner capital ───────────────────────────────────────────────────────────

const CAPITAL_KINDS: CapitalKind[] = ["CONTRIBUTION", "SHAREHOLDER_LOAN", "LOAN_REPAYMENT", "WITHDRAWAL"];

export async function listCapitalMovements(ym: string) {
  await requireFinanceView();
  const { start, end } = monthRangeUtc(ym);
  return prisma.capitalMovement.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export async function createCapitalMovement(fd: FormData): Promise<void> {
  const user = await requireFinanceEdit();
  const sede = parseSede(str(fd, "sede"));
  const kind = str(fd, "kind") as CapitalKind;
  if (!CAPITAL_KINDS.includes(kind)) throw new Error("Elige el tipo de movimiento.");
  // A persona natural has no shareholders: money in is capital, money out a withdrawal.
  if (sede === "FITNESS_CENTER" && (kind === "SHAREHOLDER_LOAN" || kind === "LOAN_REPAYMENT")) {
    throw new Error("La Fitness es persona natural: usa Aporte o Retiro.");
  }
  if (sede === "XTREME" && kind === "WITHDRAWAL") {
    throw new Error("En la S.A.S. el dinero sale como devolución de préstamo (o dividendos, no aquí).");
  }
  const person = str(fd, "person");
  if (!person) throw new Error("¿Quién puso o retiró el dinero?");
  await assertOpen(prisma, sede, parseDay(str(fd, "date"), "Fecha"));
  await prisma.capitalMovement.create({
    data: {
      sede,
      kind,
      person,
      amountCents: parseCents(str(fd, "amount"), "Monto"),
      date: parseDay(str(fd, "date"), "Fecha"),
      notes: optStr(fd, "notes"),
      createdById: user.id,
    },
  });
  revalidatePath(PATH, "layout");
}

export async function voidCapitalMovement(id: string) {
  await requireFinanceEdit();
  const c = await prisma.capitalMovement.findUniqueOrThrow({ where: { id }, select: { sede: true, date: true } });
  await assertOpen(prisma, c.sede, c.date);
  await prisma.capitalMovement.update({ where: { id, voidedAt: null }, data: { voidedAt: new Date() } });
  revalidatePath(PATH, "layout");
}

// ── Other income ────────────────────────────────────────────────────────────

const OTHER_CATEGORIES: OtherIncomeCategory[] = ["PRODUCT_SALE", "REIMBURSEMENT", "OTHER"];

export async function listOtherIncome(ym: string) {
  await requireFinanceView();
  const { start, end } = monthRangeUtc(ym);
  return prisma.otherIncome.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

export async function createOtherIncome(fd: FormData): Promise<void> {
  const user = await requireFinanceEdit();
  const category = str(fd, "category") as OtherIncomeCategory;
  if (!OTHER_CATEGORIES.includes(category)) throw new Error("Elige la categoría.");
  const description = str(fd, "description");
  if (!description) throw new Error("Escribe una descripción.");
  await assertOpen(prisma, parseSede(str(fd, "sede")), parseDay(str(fd, "date"), "Fecha"));
  await prisma.otherIncome.create({
    data: {
      sede: parseSede(str(fd, "sede")),
      category,
      description,
      amountCents: parseCents(str(fd, "amount"), "Monto"),
      date: parseDay(str(fd, "date"), "Fecha"),
      createdById: user.id,
    },
  });
  revalidatePath(PATH, "layout");
}

export async function voidOtherIncome(id: string) {
  await requireFinanceEdit();
  const o = await prisma.otherIncome.findUniqueOrThrow({ where: { id }, select: { sede: true, date: true } });
  await assertOpen(prisma, o.sede, o.date);
  await prisma.otherIncome.update({ where: { id, voidedAt: null }, data: { voidedAt: new Date() } });
  revalidatePath(PATH, "layout");
}

// ── Review ──────────────────────────────────────────────────────────────────

/** Fix an expense's category (e.g. an SRI invoice from a new supplier). The
 *  next invoice from the same RUC inherits it. */
export async function updateExpenseCategory(id: string, category: ExpenseCategory) {
  await requireFinanceEdit();
  if (!CATEGORIES.includes(category)) throw new Error("Categoría inválida.");
  const e = await prisma.expense.findUnique({ where: { id }, select: { notes: true, sede: true, date: true } });
  if (e) await assertOpen(prisma, e.sede, e.date);
  // Clear only the automatic review notes, never someone's own notes.
  const autoNote = e?.notes === "Categoría por revisar" || e?.notes === "Categoría sugerida por el proveedor";
  await prisma.expense.update({
    where: { id, voidedAt: null },
    data: { category, isPrivate: PRIVATE_CATEGORIES.includes(category), ...(autoNote ? { notes: null } : {}) },
  });
  revalidatePath(PATH, "layout");
}
