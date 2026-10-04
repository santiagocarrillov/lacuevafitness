import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CircleCheck, FileInput, FileText, HandCoins, Hourglass, Plus, Receipt, Scale, X } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ecuadorDateString } from "@/lib/timezone";
import { countPendingReview, listExpensesFiltered } from "@/lib/actions/expenses";
import { DOC_TYPE_LABELS, ENTITIES, ENTITY_ORDER, EXPENSE_CATEGORY_LABELS, fmtMoney } from "@/lib/finance/entities";
import { parseExpenseFilters } from "@/lib/expenses/filters";
import { daysOverdue, payablesAging } from "@/lib/finance/suppliers";
import { FilterBar, Pager, type FilterDef } from "@/components/list/filter-bar";
import { RangeFilter } from "@/components/list/range-filter";
import { PageHeader } from "../page-header";
import { Panel, Stat } from "../blocks";
import { AgingBar, AgingTable } from "../finanzas/proveedores/aging";
import { expenseScope } from "./shared";
import { ExpenseRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

const ORANGE = "#d97e0a";
const SEDE_SHORT: Record<string, string> = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" };

const AGE_LABELS: Record<string, string> = {
  current: "Por vencer",
  d30: "Vencido 1–30 días",
  d60: "Vencido 31–60 días",
  d90: "Vencido 61–90 días",
  older: "Vencido más de 90 días",
  vencido: "Vencido",
};

type Params = Record<string, string | undefined>;

export default async function GastosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAuth();
  const scope = await expenseScope(user);
  if (!scope) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const today = ecuadorDateString();
  const f = parseExpenseFilters(params, scope.full ? null : scope.sedes[0]);

  const [list, pendingReview, aging, supplier] = await Promise.all([
    listExpensesFiltered(f),
    countPendingReview(),
    f.view === "porpagar" && scope.full
      ? payablesAging(
          {
            ...(f.sede ? { sede: f.sede } : {}),
            ...(f.proveedor ? { supplierId: f.proveedor } : {}),
            ...(f.categorias.length ? { category: { in: f.categorias } } : {}),
          },
          today,
        )
      : null,
    f.proveedor ? prisma.supplier.findUnique({ where: { id: f.proveedor }, select: { id: true, name: true, tradeName: true } }) : null,
  ]);

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/dashboard/gastos${q.size ? `?${q}` : ""}`;
  };

  const filters: FilterDef[] = [
    { name: "categoria", title: "Categoría", multi: true, options: Object.entries(EXPENSE_CATEGORY_LABELS).filter(([k]) => scope.full || (k !== "PAYROLL" && k !== "COACH_FEES")).map(([value, label]) => ({ value, label })) },
    { name: "doc", title: "Documento", options: Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label })) },
    ...(f.view === "todos"
      ? [{ name: "estado", title: "Estado", options: [{ value: "pagado", label: "Pagado" }, { value: "porpagar", label: "Por pagar" }, { value: "vencido", label: "Vencido" }, { value: "anulado", label: "Anulados" }] }]
      : []),
  ];

  const title = f.view === "porpagar" ? "Cuentas por pagar" : f.view === "revisar" ? "Gastos por revisar" : "Gastos";
  const subtitle =
    f.view === "porpagar"
      ? "Lo que se debe a proveedores, de todas las fechas, ordenado por vencimiento."
      : f.view === "revisar"
        ? "Lo que registraron los admins y todavía no revisa contabilidad."
        : scope.full
          ? "Todo lo que se compra o se paga, con su comprobante. Cada gasto queda enlazado a su proveedor."
          : `Compras y pagos de ${ENTITIES[scope.sedes[0]].name}: caja chica, insumos, bebidas, arreglos y más. Sube la foto del comprobante.`;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title={title} subtitle={subtitle}>
        {scope.full && (
          <Link href="/dashboard/gastos/importar-sri" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 text-sm font-medium hover:border-stone-500">
            <FileInput className="size-4" /> Facturas del SRI
          </Link>
        )}
        <Link
          href={`/dashboard/gastos/nuevo${f.proveedor ? `?proveedor=${f.proveedor}` : ""}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: ORANGE }}
        >
          <Plus className="size-4" /> Registrar gasto
        </Link>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        {f.view === "todos" && <RangeFilter desde={f.desde} hasta={f.hasta} rango={f.rango} />}
        {scope.full && (
          <div className="flex rounded-full border bg-stone-50 p-0.5 text-xs" role="tablist" aria-label="Empresa">
            {[null, ...ENTITY_ORDER].map((s) => (
              <Link
                key={s ?? "todas"}
                href={href({ entidad: s })}
                role="tab"
                aria-selected={f.sede === s}
                className={`rounded-full px-3 py-1.5 font-medium transition ${f.sede === s ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {s ? SEDE_SHORT[s] : "Las dos empresas"}
              </Link>
            ))}
          </div>
        )}
        {supplier && (
          <Link href={href({ proveedor: null })} className="inline-flex items-center gap-1 rounded-full border border-[#d97e0a]/40 bg-[#d97e0a]/10 px-3 py-1 text-xs font-medium text-[#8a5206]">
            Proveedor: {supplier.tradeName ?? supplier.name} <X className="size-3" />
          </Link>
        )}
        {f.antiguedad && (
          <Link href={href({ antiguedad: null })} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-800">
            {AGE_LABELS[f.antiguedad]} <X className="size-3" />
          </Link>
        )}
      </div>

      {f.view === "porpagar" && aging ? (
        <Panel title="Antigüedad por proveedor" aside={<span className="tabular-nums">{fmtMoney(aging.total, { decimals: true })}</span>}>
          <div className="space-y-5">
            <AgingBar aging={aging} href={(b) => href({ antiguedad: b })} />
            <AgingTable aging={aging} supplierHref={(id) => `/dashboard/finanzas/proveedores/${id}`} />
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={f.view === "revisar" ? "Por revisar" : "Gastos del período"} value={fmtMoney(list.amountCents)} sub={`${list.count} documentos`} icon={Receipt} color={ORANGE} />
          <Stat label="Con factura (deducible)" value={fmtMoney(list.deductibleCents)} sub="Facturas y liquidaciones con RUC" href={href({ doc: "FACTURA" })} icon={FileText} color="#2f6fb0" />
          <Stat
            label="Por pagar"
            value={fmtMoney(list.payableCents)}
            sub={list.overdueCount ? `${list.overdueCount} vencidos · ${fmtMoney(list.overdueCents)}` : `${list.payableCount} documentos`}
            href={`/dashboard/gastos?ver=porpagar${f.sede ? `&entidad=${f.sede}` : ""}`}
            icon={HandCoins}
            color={list.overdueCount ? "#e5533f" : "#0f9f8f"}
          />
          {scope.full && (
            <Stat label="Por revisar" value={String(pendingReview)} sub="Registrados por los admins" href="/dashboard/gastos?ver=revisar" icon={Scale} color={pendingReview ? "#6b4fb5" : "#0f9f8f"} />
          )}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <FilterBar filters={filters} searchPlaceholder="Proveedor, detalle o número de documento…" />
        {list.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {f.view === "revisar" ? "No hay gastos por revisar." : f.view === "porpagar" ? "No hay cuentas por pagar." : "No hay gastos con estos filtros."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{f.view === "porpagar" ? "Vence" : "Fecha"}</th>
                  <th className="px-3 py-2.5 font-medium">Proveedor</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Detalle</th>
                  {scope.full && <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Empresa</th>}
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Registró</th>
                  <th className="px-4 py-2.5" aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const late = r.status === "PENDING" && !r.voidedAt ? daysOverdue(r, today) : 0;
                  const name = r.supplier ? r.supplier.tradeName ?? r.supplier.name : r.supplierName ?? "—";
                  const shown = f.view === "porpagar" ? r.dueDate ?? r.date : r.date;
                  return (
                    <tr key={r.id} className={`border-b align-top last:border-0 hover:bg-stone-50 ${r.voidedAt ? "text-muted-foreground" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{shown.toISOString().slice(0, 10)}</td>
                      <td className="px-3 py-2.5">
                        {r.supplier ? (
                          <Link href={`/dashboard/finanzas/proveedores/${r.supplier.id}`} className={`font-medium hover:underline ${r.voidedAt ? "line-through" : ""}`}>{name}</Link>
                        ) : (
                          <span className="font-medium">{name}</span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          <Link href={`/dashboard/gastos/${r.id}`} className="hover:underline">
                            {DOC_TYPE_LABELS[r.documentType]}
                            {r.documentNumber ? ` ${r.documentNumber}` : ""}
                          </Link>
                          {r.receiptPath ? " · 📎" : ""}
                        </p>
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        <Link href={`/dashboard/gastos/${r.id}`} className="block hover:underline">
                          {r.lines.length ? (
                            r.lines.slice(0, 3).map((l) => (
                              <p key={l.id} className="text-xs">
                                <span className="text-muted-foreground">{l.account.name}:</span> {l.description}
                              </p>
                            ))
                          ) : (
                            <p className="text-xs">{r.description}</p>
                          )}
                        </Link>
                      </td>
                      {scope.full && (
                        <td className="hidden px-3 py-2.5 text-xs text-muted-foreground xl:table-cell">
                          {SEDE_SHORT[r.sede]}
                          {r.isPrivate ? " · 🔒" : ""}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        {r.voidedAt ? (
                          <span className="text-xs text-red-700" title={r.voidReason ?? undefined}>Anulado</span>
                        ) : r.status === "PAID" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                            <CircleCheck className="size-3" /> Pagado
                          </span>
                        ) : late > 0 ? (
                          <Link href={`/dashboard/gastos/${r.id}`} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200">
                            <CalendarClock className="size-3" /> Vencido {late} d
                          </Link>
                        ) : (
                          <Link href={`/dashboard/gastos/${r.id}`} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                            <Hourglass className="size-3" /> Por pagar
                          </Link>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${r.voidedAt ? "line-through" : ""}`}>{fmtMoney(r.amountCents, { decimals: true })}</td>
                      <td className="hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">
                        {r.createdByName ?? "Automático"}
                        {!r.reviewedAt && !r.voidedAt && <span className="ml-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">por revisar</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {r.status === "PENDING" && !r.voidedAt && scope.full && (
                            <Link href={`/dashboard/gastos/${r.id}`} className="rounded-full border border-[#2f6fb0]/40 px-2 py-0.5 text-xs font-medium text-[#2f6fb0] hover:bg-[#2f6fb0]/10">
                              Pagar
                            </Link>
                          )}
                          {!r.voidedAt && (
                            <ExpenseRowActions id={r.id} canReview={scope.full && !r.reviewedAt} canVoid={scope.full || (r.createdById === user.id && !r.reviewedAt)} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t">
          <Pager page={list.page} totalPages={list.totalPages} total={list.total} noun="gastos" />
        </div>
      </section>
    </div>
  );
}
