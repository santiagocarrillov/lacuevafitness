// Supplier directory derived from expenses (no auth — callers check). There is
// no Supplier table yet: a supplier is its RUC, or its name when the document
// had none. Payroll and coach fees (private) belong to Trabajadores, not here.

import { prisma } from "@/lib/prisma";
import type { ExpenseCategory, Sede } from "@/generated/prisma/client";

export type SupplierRow = {
  key: string;
  name: string;
  ruc: string | null;
  sedes: Sede[];
  topCategory: ExpenseCategory;
  docs: number;
  yearCents: number;
  payableCents: number;
  lastDate: Date;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/\s+/g, " ");

/** URL-safe key: the RUC, or "n-" + a slug of the name. */
export function supplierKey(e: { supplierRuc: string | null; supplierName: string | null; description: string }) {
  if (e.supplierRuc) return e.supplierRuc;
  const slug = norm(e.supplierName || e.description).replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `n-${slug || "sin-nombre"}`;
}

/** Where-clause for one supplier key. */
export function supplierWhere(key: string) {
  if (!key.startsWith("n-")) return { supplierRuc: key };
  return { supplierRuc: null };
}

export async function listSuppliers(sedes: Sede[], year: number): Promise<SupplierRow[]> {
  const rows = await prisma.expense.findMany({
    where: { sede: { in: sedes }, voidedAt: null, isPrivate: false, date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    select: { sede: true, supplierRuc: true, supplierName: true, description: true, category: true, amountCents: true, status: true, date: true },
  });
  const map = new Map<string, SupplierRow & { cats: Map<ExpenseCategory, number> }>();
  for (const e of rows) {
    const key = supplierKey(e);
    const r =
      map.get(key) ??
      ({
        key,
        name: e.supplierName || e.description,
        ruc: e.supplierRuc,
        sedes: [],
        topCategory: e.category,
        docs: 0,
        yearCents: 0,
        payableCents: 0,
        lastDate: e.date,
        cats: new Map(),
      } as SupplierRow & { cats: Map<ExpenseCategory, number> });
    if (!r.sedes.includes(e.sede)) r.sedes.push(e.sede);
    r.docs += 1;
    r.yearCents += e.amountCents;
    if (e.status === "PENDING") r.payableCents += e.amountCents;
    if (e.date > r.lastDate) r.lastDate = e.date;
    r.cats.set(e.category, (r.cats.get(e.category) ?? 0) + e.amountCents);
    map.set(key, r);
  }
  return [...map.values()]
    .map(({ cats, ...r }) => ({ ...r, topCategory: [...cats].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.yearCents - a.yearCents);
}

/** Every expense of one supplier (all years). */
export async function supplierExpenses(sedes: Sede[], key: string) {
  const rows = await prisma.expense.findMany({
    where: { sede: { in: sedes }, isPrivate: false, ...supplierWhere(key) },
    orderBy: { date: "desc" },
    select: {
      id: true, sede: true, date: true, description: true, supplierName: true, supplierRuc: true, category: true,
      documentType: true, documentNumber: true, amountCents: true, ivaCents: true, status: true, dueDate: true, voidedAt: true,
    },
  });
  return key.startsWith("n-") ? rows.filter((r) => supplierKey(r) === key) : rows;
}
