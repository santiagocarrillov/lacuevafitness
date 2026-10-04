// Filters of the Gastos list, in the URL (client-safe, no server imports).

import type { ExpenseCategory, ExpenseDocType, Prisma, Sede } from "@/generated/prisma/client";
import { parseRange, addDays } from "@/lib/date-range";
import { DOC_TYPE_LABELS, EXPENSE_CATEGORY_LABELS } from "@/lib/finance/entities";

/** todos = by date range · porpagar / revisar = every date. */
export type ExpenseView = "todos" | "porpagar" | "revisar";
export type AgeFilter = "current" | "d30" | "d60" | "d90" | "older" | "vencido";

export type ExpenseListFilters = {
  view: ExpenseView;
  desde: string;
  hasta: string;
  rango: string | null;
  sede: Sede | null;
  categorias: ExpenseCategory[];
  doc: ExpenseDocType | null;
  estado: "pagado" | "porpagar" | "vencido" | "anulado" | null;
  proveedor: string | null;
  antiguedad: AgeFilter | null;
  q: string;
  page: number;
};

const CATS = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
const DOCS = Object.keys(DOC_TYPE_LABELS) as ExpenseDocType[];
const AGES: AgeFilter[] = ["current", "d30", "d60", "d90", "older", "vencido"];

export function parseExpenseFilters(sp: Record<string, string | undefined>, scopedSede: Sede | null): ExpenseListFilters {
  const view: ExpenseView = sp.ver === "porpagar" || sp.ver === "revisar" ? sp.ver : "todos";
  const { desde, hasta, rango } = parseRange(sp);
  const categoria = sp.categoria ?? "";
  return {
    view,
    desde,
    hasta,
    rango,
    sede: scopedSede ?? (sp.entidad === "FITNESS_CENTER" || sp.entidad === "XTREME" ? sp.entidad : null),
    categorias: categoria.split(",").filter((c): c is ExpenseCategory => CATS.includes(c as ExpenseCategory)),
    doc: DOCS.includes(sp.doc as ExpenseDocType) ? (sp.doc as ExpenseDocType) : null,
    estado: sp.estado === "pagado" || sp.estado === "porpagar" || sp.estado === "vencido" || sp.estado === "anulado" ? sp.estado : null,
    proveedor: sp.proveedor && /^[a-z0-9]{10,40}$/.test(sp.proveedor) ? sp.proveedor : null,
    antiguedad: AGES.includes(sp.antiguedad as AgeFilter) ? (sp.antiguedad as AgeFilter) : null,
    q: (sp.q ?? "").trim().slice(0, 80),
    page: Math.max(1, parseInt(sp.page ?? "1", 10) || 1),
  };
}

const d = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/** Due date (or document date when it has none) inside [from, to] — both optional, inclusive. */
function dueBetween(from: string | null, to: string | null): Prisma.ExpenseWhereInput {
  const range = { ...(from ? { gte: d(from) } : {}), ...(to ? { lte: d(to) } : {}) };
  return { OR: [{ dueDate: range }, { dueDate: null, date: range }] };
}

/** Unpaid and past due as of `today`. */
export const overdueWhere = (today: string): Prisma.ExpenseWhereInput => ({
  status: "PENDING",
  voidedAt: null,
  ...dueBetween(null, addDays(today, -1)),
});

export function expenseWhere(f: ExpenseListFilters, today: string, matchIds?: string[] | null): Prisma.ExpenseWhereInput {
  const and: Prisma.ExpenseWhereInput[] = [];
  if (f.view === "todos") and.push({ date: { gte: d(f.desde), lte: d(f.hasta) } });
  if (f.view === "porpagar") and.push({ status: "PENDING", voidedAt: null });
  if (f.view === "revisar") and.push({ reviewedAt: null, voidedAt: null });
  if (f.sede) and.push({ sede: f.sede });
  if (f.categorias.length) and.push({ category: { in: f.categorias } });
  if (f.doc) and.push({ documentType: f.doc });
  if (f.proveedor) and.push({ supplierId: f.proveedor });
  if (f.estado === "pagado") and.push({ status: "PAID", voidedAt: null });
  if (f.estado === "porpagar") and.push({ status: "PENDING", voidedAt: null });
  if (f.estado === "vencido") and.push(overdueWhere(today));
  if (f.estado === "anulado") and.push({ voidedAt: { not: null } });
  if (f.antiguedad) {
    const ago = (n: number) => addDays(today, -n);
    const ranges: Record<AgeFilter, [string | null, string | null]> = {
      current: [today, null],
      d30: [ago(30), ago(1)],
      d60: [ago(60), ago(31)],
      d90: [ago(90), ago(61)],
      older: [null, ago(91)],
      vencido: [null, ago(1)],
    };
    const [from, to] = ranges[f.antiguedad];
    and.push({ status: "PENDING", voidedAt: null }, dueBetween(from, to));
  }
  if (matchIds) and.push({ id: { in: matchIds } });
  return { AND: and };
}
