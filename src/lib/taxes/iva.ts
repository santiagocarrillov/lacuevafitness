// Monthly IVA summary for formulario 104 (server only, no auth). Uses the same
// documents as the journal: sales = invoices issued in the app + collections
// without one (invoiced in Ecuafact during the transition) + product sales;
// purchases = expenses backed by a document. Casilleros per the SRI guide
// ("Guía para el llenado del Formulario IVA").

import { prisma } from "@/lib/prisma";
import type { ExpenseDocType, Sede } from "@/generated/prisma/client";
import { postingDay, splitIva } from "@/lib/accounting/posting";
import { monthRangeUtc, shiftMonth } from "@/lib/finance/entities";

const DAY = 86_400_000;
export const IVA_START = "2026-01"; // first month the app keeps (opening balances 31-dic-2025)

export type PurchaseDoc = {
  expenseId: string;
  date: Date;
  supplierName: string | null;
  supplierRuc: string | null;
  documentType: ExpenseDocType;
  documentNumber: string | null;
  accessKey: string | null;
  totalCents: number;
  baseTaxedCents: number; // gravada tarifa ≠ 0
  baseZeroCents: number; // tarifa 0
  ivaCents: number;
  assetCents: number; // part of the taxed base that went to fixed assets
  paymentMethod: string | null;
  problems: string[];
};

export type IvaMonth = {
  sede: Sede;
  ym: string;
  sales: {
    appInvoices: { count: number; baseCents: number; ivaCents: number };
    collections: { count: number; baseCents: number; ivaCents: number };
    products: { count: number; baseCents: number; ivaCents: number };
    baseCents: number; // 401 = 411
    ivaCents: number; // 421 = 482 = 484 = 499
  };
  purchases: {
    credit: { count: number; baseCents: number; ivaCents: number }; // 500 / 510 / 520
    zero: { count: number; baseCents: number }; // 507 / 517
    popular: { count: number; totalCents: number }; // 508 / 518 notas de venta RIMPE
    notDeclared: { count: number; totalCents: number }; // recibos y sin documento
    docs: PurchaseDoc[];
  };
  credit605: number; // saldo crédito tributario del mes anterior
  creditApplied564: number;
  toPay: number; // 601 → 620/699
  carry615: number; // saldo crédito tributario para el próximo mes
};

const ASSET_CODES = ["1.2.01", "1.2.02", "1.2.03"];

/** Purchases of a month that carry a document (credit) or must be listed. */
async function purchases(sede: Sede, start: Date, end: Date): Promise<PurchaseDoc[]> {
  const rows = await prisma.expense.findMany({
    where: { sede, voidedAt: null, date: { gte: start, lt: end } },
    include: { lines: { include: { account: { select: { code: true } } } } },
    orderBy: { date: "asc" },
  });
  return rows.map((e) => {
    let taxed = 0, zero = 0, iva = 0, asset = 0;
    if (e.lines.length) {
      for (const l of e.lines) {
        if (l.ivaRate > 0) taxed += l.subtotalCents;
        else zero += l.subtotalCents;
        iva += l.ivaCents;
        if (ASSET_CODES.includes(l.account.code) && l.ivaRate > 0) asset += l.subtotalCents;
      }
    } else {
      iva = e.ivaCents ?? 0;
      const sub = e.subtotalCents ?? e.amountCents - iva;
      // Header-only documents (SRI XML): the taxed base is implied by the IVA.
      taxed = iva > 0 ? Math.min(sub, Math.round(iva / 0.15)) : 0;
      zero = sub - taxed;
    }
    const problems: string[] = [];
    const isDoc = e.documentType === "FACTURA" || e.documentType === "LIQUIDACION_COMPRA" || e.documentType === "NOTA_VENTA";
    if (isDoc && !e.supplierRuc) problems.push("falta el RUC del proveedor");
    if (isDoc && !/^\d{3}-\d{3}-\d{1,9}$/.test(e.documentNumber ?? "")) problems.push("falta el número del comprobante");
    if (isDoc && e.documentType !== "NOTA_VENTA" && !e.sriAccessKey && e.documentNumber) problems.push("sin clave de acceso (¿factura física?)");
    return {
      expenseId: e.id,
      date: e.date,
      supplierName: e.supplierName,
      supplierRuc: e.supplierRuc,
      documentType: e.documentType,
      documentNumber: e.documentNumber,
      accessKey: e.sriAccessKey,
      totalCents: e.amountCents,
      baseTaxedCents: taxed,
      baseZeroCents: zero,
      ivaCents: iva,
      assetCents: asset,
      paymentMethod: e.paymentMethod,
      problems,
    };
  });
}

async function sales(sede: Sede, start: Date, end: Date) {
  const inMonth = (d: Date) => d.getTime() >= start.getTime() && d.getTime() < end.getTime();
  const wide = { gte: new Date(start.getTime() - DAY), lt: new Date(end.getTime() + DAY) };
  const [invoices, payments, products] = await Promise.all([
    prisma.invoice.findMany({ where: { sede, status: { not: "VOIDED" }, issueDate: { gte: start, lt: end } }, select: { subtotalCents: true, ivaCents: true } }),
    prisma.payment.findMany({
      where: {
        sede,
        paidAt: wide,
        status: { in: ["SUCCEEDED", "PENDING"] },
        NOT: { isPoolEntry: true, status: "SUCCEEDED" },
        OR: [{ invoiceId: null }, { invoice: { status: "VOIDED" } }],
      },
      select: { amountCents: true, paidAt: true },
    }),
    prisma.otherIncome.findMany({ where: { sede, voidedAt: null, category: "PRODUCT_SALE", date: { gte: start, lt: end } }, select: { amountCents: true } }),
  ]);
  const sum = (rows: { net: number; iva: number }[]) => ({ count: rows.length, baseCents: rows.reduce((a, r) => a + r.net, 0), ivaCents: rows.reduce((a, r) => a + r.iva, 0) });
  const appInvoices = sum(invoices.map((i) => ({ net: i.subtotalCents, iva: i.ivaCents })));
  const collections = sum(payments.filter((p) => inMonth(postingDay(p.paidAt!))).map((p) => splitIva(p.amountCents)));
  const prod = sum(products.map((o) => splitIva(o.amountCents)));
  return {
    appInvoices,
    collections,
    products: prod,
    baseCents: appInvoices.baseCents + collections.baseCents + prod.baseCents,
    ivaCents: appInvoices.ivaCents + collections.ivaCents + prod.ivaCents,
  };
}

/** IVA credit carried into 2026: opening balance of 1.3.01. */
async function openingCredit(sede: Sede) {
  const ob = await prisma.openingBalance.findMany({ where: { account: { sede, code: "1.3.01" } }, select: { amountCents: true } });
  return ob.reduce((a, o) => a + o.amountCents, 0);
}

async function month(sede: Sede, ym: string, credit605: number): Promise<IvaMonth> {
  const { start, end } = monthRangeUtc(ym);
  const [s, docs] = await Promise.all([sales(sede, start, end), purchases(sede, start, end)]);
  const credit = docs.filter((d) => (d.documentType === "FACTURA" || d.documentType === "LIQUIDACION_COMPRA") && d.ivaCents > 0);
  const zero = docs.filter((d) => (d.documentType === "FACTURA" || d.documentType === "LIQUIDACION_COMPRA") && d.baseZeroCents > 0);
  const popular = docs.filter((d) => d.documentType === "NOTA_VENTA");
  const notDeclared = docs.filter((d) => d.documentType === "RECIBO" || d.documentType === "SIN_DOCUMENTO");
  const creditIva = credit.reduce((a, d) => a + d.ivaCents, 0);
  // All sales are taxed at 15 %: proportionality factor 1, the full IVA paid is credit.
  const available = credit605 + creditIva;
  const net = s.ivaCents - available;
  return {
    sede,
    ym,
    sales: s,
    purchases: {
      credit: { count: credit.length, baseCents: credit.reduce((a, d) => a + d.baseTaxedCents, 0), ivaCents: creditIva },
      zero: { count: zero.length, baseCents: zero.reduce((a, d) => a + d.baseZeroCents, 0) },
      popular: { count: popular.length, totalCents: popular.reduce((a, d) => a + d.totalCents, 0) },
      notDeclared: { count: notDeclared.length, totalCents: notDeclared.reduce((a, d) => a + d.totalCents, 0) },
      docs,
    },
    credit605,
    creditApplied564: creditIva,
    toPay: Math.max(0, net),
    carry615: Math.max(0, -net),
  };
}

/** The month's summary, carrying the credit balance forward from January 2026. */
export async function ivaMonth(sede: Sede, ym: string): Promise<IvaMonth> {
  if (ym < IVA_START) throw new Error("La app lleva el IVA desde enero 2026.");
  let carry = await openingCredit(sede);
  for (let m = IVA_START; m < ym; m = shiftMonth(m, 1)) carry = (await month(sede, m, carry)).carry615;
  return month(sede, ym, carry);
}
