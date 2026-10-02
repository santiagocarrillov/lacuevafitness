// SRI received invoices → expenses (no auth — callers must check permissions).
// One expense, two sources: an invoice whose amount matches an expense that
// came from the bank (no invoice yet) is attached to it instead of creating a
// second record; the bank inbox does the same in the other direction.

import { PRIVATE_CATEGORIES } from "@/lib/expenses/core";
import { prisma } from "@/lib/prisma";
import type { ExpenseCategory, ExpensePayMethod, Prisma, Sede } from "@/generated/prisma/client";
import { ENTITIES, entityForBuyer } from "@/lib/finance/entities";
import { decodeAccessKey, type DecodedKey, type SriDocument } from "@/lib/finance/sri-xml";
import { lockedThrough } from "@/lib/accounting/posting";

type Db = Prisma.TransactionClient | typeof prisma;

export type SriOutcome = {
  accessKey: string;
  issuerName: string;
  docNumber: string;
  totalCents: number;
  status: "created" | "linked" | "duplicate" | "rejected";
  detail: string;
  sede?: Sede;
};

// Supplier name → category, for suppliers never seen before. Learned
// categories (same RUC, previous expense) always win.
const KEYWORDS: [RegExp, ExpenseCategory][] = [
  [/electric|cnel|eeq|empresa publica metropolitana de agua|epmaps|agua potable/i, "UTILITIES"],
  [/\bcnt\b|claro|conecel|movistar|otecel|netlife|telconet|puntonet|xtrim|tvcable/i, "UTILITIES"],
  [/facebook|meta platforms|google|tiktok/i, "MARKETING"],
  [/security data|anf ac|uanataca|firma digital|software|microsoft|adobe|hubspot|quickbooks|intuit|ecuafact/i, "SOFTWARE"],
  [/supermaxi|favorita|megamaxi|\btia\b|tiendas industriales|\baki\b|santa maria|coral|kywi|ferrisariato|ferreter/i, "SUPPLIES"],
  [/servicio de rentas internas|\bsri\b|municipio|gad |superintendencia/i, "TAXES"],
  [/contador|contable|abogad|legal|asesor/i, "PROFESSIONAL"],
  [/arriendo|alquiler|inmobiliaria/i, "RENT"],
];

async function guessCategory(db: Db, doc: SriDocument): Promise<{ category: ExpenseCategory; learned: boolean }> {
  const prior = await db.expense.findFirst({
    where: { supplierRuc: doc.issuerRuc, voidedAt: null, category: { not: "OTHER" } },
    // The latest decision wins (a category fixed by hand updates the row).
    orderBy: { updatedAt: "desc" },
    select: { category: true },
  });
  if (prior) return { category: prior.category, learned: true };
  const text = `${doc.issuerName} ${doc.description}`;
  const hit = KEYWORDS.find(([re]) => re.test(text));
  return { category: hit ? hit[1] : "OTHER", learned: false };
}

/** Cash and cards are settled at purchase; transfers/credit wait for the bank. */
function settlement(doc: SriDocument): { paid: boolean; method: ExpensePayMethod | null } {
  switch (doc.payForm) {
    case "01": return { paid: true, method: "CASH" };
    case "16": return { paid: true, method: "DEBIT_CARD" };
    case "19": return { paid: true, method: "CREDIT_CARD" };
    default: return { paid: false, method: null };
  }
}

const DAY = 86_400_000;

export async function importSriDocument(
  db: Db,
  doc: SriDocument,
  opts: { sede: Sede; userId: string; receiptPath?: string | null },
): Promise<SriOutcome> {
  const base = { accessKey: doc.accessKey, issuerName: doc.issuerName, docNumber: doc.docNumber, totalCents: doc.totalCents };

  const dup = await db.expense.findUnique({ where: { sriAccessKey: doc.accessKey }, select: { sede: true, voidedAt: true } });
  if (dup) return { ...base, status: "duplicate", detail: dup.voidedAt ? "Ya se importó (anulada)" : "Ya estaba importada", sede: dup.sede };

  // The buyer ID decides the entity when we know it; otherwise the one chosen.
  const byBuyer = entityForBuyer(doc.buyerId);
  const chosen = ENTITIES[opts.sede];
  if (!byBuyer && chosen.taxIds.length > 0) {
    return { ...base, status: "rejected", detail: `Emitida a ${doc.buyerName || doc.buyerId} (${doc.buyerId}), no a ${chosen.name}` };
  }
  const sede = byBuyer ?? opts.sede;
  const lock = await lockedThrough(db, sede);
  if (lock && doc.issueDate.getTime() <= lock.getTime()) {
    return { ...base, status: "rejected", detail: `El período está cerrado hasta el ${lock.toISOString().slice(0, 10)}`, sede };
  }
  const docType = doc.codDoc === "03" ? "LIQUIDACION_COMPRA" : "FACTURA";
  const { category, learned } = await guessCategory(db, doc);
  const docFields = {
    supplierName: doc.issuerName,
    supplierRuc: doc.issuerRuc,
    documentType: docType,
    documentNumber: doc.docNumber,
    sriAccessKey: doc.accessKey,
    subtotalCents: doc.subtotalCents,
    ivaCents: doc.ivaCents,
  } as const;

  // An expense that came from the bank (or was typed by hand) for the same amount.
  const candidates = await db.expense.findMany({
    where: {
      sede,
      amountCents: doc.totalCents,
      sriAccessKey: null,
      voidedAt: null,
      date: { gte: new Date(doc.issueDate.getTime() - 10 * DAY), lte: new Date(doc.issueDate.getTime() + 45 * DAY) },
    },
    orderBy: { date: "asc" },
  });
  const match =
    candidates.length === 1
      ? candidates[0]
      : candidates
          .filter((c) => c.bankTransactionId)
          .sort((a, b) => Math.abs(a.date.getTime() - doc.issueDate.getTime()) - Math.abs(b.date.getTime() - doc.issueDate.getTime()))[0];

  if (match) {
    await db.expense.update({
      where: { id: match.id },
      data: {
        ...docFields,
        date: doc.issueDate,
        description: doc.description,
        category: match.category === "OTHER" ? category : match.category,
        receiptPath: match.receiptPath ?? opts.receiptPath ?? null,
      },
    });
    return {
      ...base, status: "linked", sede,
      detail: match.bankTransactionId ? "Enlazada al débito del banco" : "Enlazada al gasto ya registrado",
    };
  }

  const { paid, method } = settlement(doc);
  await db.expense.create({
    data: {
      ...docFields,
      sede,
      category,
      isPrivate: PRIVATE_CATEGORIES.includes(category),
      description: doc.description,
      amountCents: doc.totalCents,
      date: doc.issueDate,
      status: paid ? "PAID" : "PENDING",
      paidAt: paid ? doc.issueDate : null,
      paymentMethod: method,
      dueDate: !paid && doc.termDays > 0 ? new Date(doc.issueDate.getTime() + doc.termDays * DAY) : null,
      receiptPath: opts.receiptPath ?? null,
      createdById: opts.userId,
      notes: category === "OTHER" ? "Categoría por revisar" : learned ? null : "Categoría sugerida por el proveedor",
    },
  });
  return {
    ...base, status: "created", sede,
    detail: paid ? `Pagada (${method === "CASH" ? "efectivo" : "tarjeta"})` : "Por pagar: se cierra al conciliar el débito",
  };
}

export type CompletenessReport = {
  totalKeys: number;
  imported: number;
  notExpenses: number; // retenciones, guías, notas
  missing: (DecodedKey & { codName: string })[];
};

/** Which invoices in the SRI "recibidos" report are not in the app yet. */
export async function checkCompleteness(db: Db, keys: string[]): Promise<CompletenessReport> {
  const decoded = keys.map(decodeAccessKey).filter((d): d is DecodedKey => !!d);
  const expenseKeys = decoded.filter((d) => d.codDoc === "01" || d.codDoc === "03");
  const have = await db.expense.findMany({
    where: { sriAccessKey: { in: expenseKeys.map((d) => d.key) } },
    select: { sriAccessKey: true },
  });
  const haveSet = new Set(have.map((h) => h.sriAccessKey));
  const missing = expenseKeys
    .filter((d) => !haveSet.has(d.key))
    .sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime())
    .map((d) => ({ ...d, codName: d.codDoc === "03" ? "Liquidación de compra" : "Factura" }));
  return {
    totalKeys: decoded.length,
    imported: haveSet.size,
    notExpenses: decoded.length - expenseKeys.length,
    missing,
  };
}
