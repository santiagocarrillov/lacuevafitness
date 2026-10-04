// Supplier directory (no auth — callers check). Every expense is linked to a
// Supplier when saved: by RUC/cédula, else by its name (ignoring case and
// accents); a new one is created on the fly, so nobody has to register
// suppliers before recording an expense.

import { prisma } from "@/lib/prisma";
import { Prisma, type ExpenseCategory, type Sede, type TaxIdType } from "@/generated/prisma/client";
import { SQL_ACCENTS_FROM, SQL_ACCENTS_TO, foldText } from "@/lib/whatsapp/search";

type Db = Prisma.TransactionClient | typeof prisma;

export const guessIdType = (id: string): TaxIdType => (id.length === 13 ? "RUC" : "CEDULA");

/** Supplier id for an expense: the chosen one, or found/created by RUC or name. */
export async function resolveSupplier(db: Db, s: { id?: string | null; name?: string | null; taxId?: string | null }): Promise<string | null> {
  if (s.id) {
    const found = await db.supplier.findUnique({ where: { id: s.id }, select: { id: true } });
    if (found) return found.id;
  }
  const name = s.name?.trim();
  const taxId = s.taxId?.trim() || null;
  if (taxId) {
    const found = await db.supplier.findUnique({ where: { taxId }, select: { id: true } });
    if (found) return found.id;
    if (!name) return null;
    return (await db.supplier.create({ data: { name, taxId, taxIdType: guessIdType(taxId) } })).id;
  }
  if (!name) return null;
  const same = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Supplier"
    WHERE translate(lower(trim("name")), ${SQL_ACCENTS_FROM}, ${SQL_ACCENTS_TO}) = ${foldText(name)}
       OR translate(lower(trim("tradeName")), ${SQL_ACCENTS_FROM}, ${SQL_ACCENTS_TO}) = ${foldText(name)}
    ORDER BY ("taxId" IS NULL) ASC, "createdAt" ASC LIMIT 1`;
  if (same[0]) return same[0].id;
  return (await db.supplier.create({ data: { name } })).id;
}

// ── Aging (antigüedad de cuentas por pagar) ─────────────────────────────────

export const AGING_BUCKETS = [
  { key: "current", label: "Por vencer" },
  { key: "d30", label: "1–30 días" },
  { key: "d60", label: "31–60 días" },
  { key: "d90", label: "61–90 días" },
  { key: "older", label: "Más de 90" },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

/** Days past due (negative = not due yet). Due = due date, else document date. */
export function daysOverdue(e: { dueDate: Date | null; date: Date }, today: string) {
  const due = (e.dueDate ?? e.date).toISOString().slice(0, 10);
  return Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000);
}

export function agingBucket(days: number): AgingKey {
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "older";
}

export type AgingRow = { supplierId: string | null; name: string; total: number } & Record<AgingKey, number>;

/** Unpaid documents by supplier and age (QuickBooks' A/P aging summary). */
export async function payablesAging(where: Prisma.ExpenseWhereInput, today: string) {
  const rows = await prisma.expense.findMany({
    where: { ...where, status: "PENDING", voidedAt: null },
    select: { id: true, amountCents: true, dueDate: true, date: true, supplierId: true, supplierName: true, description: true },
  });
  const empty = (): Record<AgingKey, number> => ({ current: 0, d30: 0, d60: 0, d90: 0, older: 0 });
  const totals = empty();
  const bySupplier = new Map<string, AgingRow>();
  for (const r of rows) {
    const b = agingBucket(daysOverdue(r, today));
    totals[b] += r.amountCents;
    const key = r.supplierId ?? `n:${r.supplierName ?? r.description}`;
    const row = bySupplier.get(key) ?? { supplierId: r.supplierId, name: r.supplierName ?? r.description, total: 0, ...empty() };
    row[b] += r.amountCents;
    row.total += r.amountCents;
    bySupplier.set(key, row);
  }
  return {
    totals,
    total: rows.reduce((a, r) => a + r.amountCents, 0),
    count: rows.length,
    overdueCount: rows.filter((r) => daysOverdue(r, today) > 0).length,
    suppliers: [...bySupplier.values()].sort((a, b) => b.total - a.total),
  };
}

// ── Directory ───────────────────────────────────────────────────────────────

export type SupplierStats = {
  id: string;
  name: string;
  tradeName: string | null;
  taxId: string | null;
  sedes: Sede[];
  topCategory: ExpenseCategory | null;
  docs: number;
  yearCents: number;
  payableCents: number;
  overdueCents: number;
  lastDate: Date | null;
};

/**
 * Suppliers with their purchases in `year` and what is owed (any date).
 * Personnel costs (private) stay out: they belong to Trabajadores.
 */
export async function supplierStats(opts: { sedes: Sede[]; year: number; today: string; ids?: string[] | null }): Promise<SupplierStats[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { active: true, ...(opts.ids ? { id: { in: opts.ids } } : {}) },
    select: { id: true, name: true, tradeName: true, taxId: true },
  });
  const expenses = await prisma.expense.findMany({
    where: { supplierId: { in: suppliers.map((s) => s.id) }, sede: { in: opts.sedes }, voidedAt: null, isPrivate: false },
    select: { supplierId: true, sede: true, category: true, amountCents: true, status: true, date: true, dueDate: true },
  });
  const yStart = new Date(Date.UTC(opts.year, 0, 1));
  const yEnd = new Date(Date.UTC(opts.year + 1, 0, 1));
  const out = new Map<string, SupplierStats & { cats: Map<ExpenseCategory, number> }>();
  for (const s of suppliers) {
    out.set(s.id, { ...s, sedes: [], topCategory: null, docs: 0, yearCents: 0, payableCents: 0, overdueCents: 0, lastDate: null, cats: new Map() });
  }
  for (const e of expenses) {
    const r = out.get(e.supplierId!)!;
    if (!r.sedes.includes(e.sede)) r.sedes.push(e.sede);
    if (!r.lastDate || e.date > r.lastDate) r.lastDate = e.date;
    if (e.status === "PENDING") {
      r.payableCents += e.amountCents;
      if (daysOverdue(e, opts.today) > 0) r.overdueCents += e.amountCents;
    }
    if (e.date >= yStart && e.date < yEnd) {
      r.docs += 1;
      r.yearCents += e.amountCents;
      r.cats.set(e.category, (r.cats.get(e.category) ?? 0) + e.amountCents);
    }
  }
  return [...out.values()]
    .map(({ cats, ...r }) => ({ ...r, topCategory: [...cats].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }))
    .sort((a, b) => b.yearCents - a.yearCents || b.payableCents - a.payableCents || a.name.localeCompare(b.name));
}
