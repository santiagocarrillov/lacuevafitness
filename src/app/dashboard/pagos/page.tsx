import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, CircleCheck, Clock3, FileText, Hourglass, Landmark, Lock, Plus, Receipt, Upload, type LucideIcon } from "lucide-react";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import {
  getPoolEntries,
  getPendingMemberPayments,
  getPaymentSummary,
  listPayments,
  deletePoolEntry,
  deletePendingPayment,
  deletePayment,
} from "@/lib/actions/payments";
import { ENTITIES, ENTITY_ORDER, fmtMoney } from "@/lib/finance/entities";
import { formatDocNumber } from "@/lib/invoicing/core";
import { METHOD_LABELS, parsePaymentFilters } from "@/lib/payments/filters";
import { ecuadorDateString } from "@/lib/timezone";
import { FilterBar, Pager, type FilterDef } from "@/components/list/filter-bar";
import { PageHeader } from "../(finanzas)/page-header";
import { Panel, Stat } from "../(finanzas)/blocks";
import { PoolEntryForm } from "./pool-form";
import { DeleteButton } from "./delete-button";
import { RangeFilter } from "./range-filter";

export const dynamic = "force-dynamic";

const TEAL = "#0f9f8f";

const STATUS: Record<string, { label: string; cls: string; icon: LucideIcon }> = {
  PENDING: { label: "Sin depositar", cls: "bg-amber-50 text-amber-800 ring-amber-200", icon: Hourglass },
  SUCCEEDED: { label: "Confirmado", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", icon: CircleCheck },
  FAILED: { label: "Fallido", cls: "bg-red-50 text-red-800 ring-red-200", icon: Clock3 },
  REFUNDED: { label: "Reembolsado", cls: "bg-stone-100 text-stone-600 ring-stone-200", icon: Clock3 },
};

const SEDE_SHORT: Record<string, string> = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" };

const fmtDay = (d: Date | null) => {
  if (!d) return "—";
  const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const ymd = isDateOnly ? d.toISOString().slice(0, 10) : ecuadorDateString(d);
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-EC", { day: "2-digit", month: "short", timeZone: "UTC" });
};

type Tab = "pagos" | "sin-asignar" | "ingresar";
type Params = Record<string, string | undefined>;

const FILTERS: FilterDef[] = [
  { name: "estado", title: "Estado", options: [{ value: "confirmado", label: "Confirmado" }, { value: "pendiente", label: "Sin depositar" }] },
  { name: "metodo", title: "Forma de pago", multi: true, options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) },
  { name: "factura", title: "Factura", options: [{ value: "con", label: "Facturado" }, { value: "sin", label: "Sin factura" }] },
  { name: "banco", title: "Banco", options: [{ value: "conciliado", label: "Conciliado" }, { value: "sin", label: "Sin conciliar" }] },
];

export default async function PagosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");

  const scopedSede = getSedeScope(user);
  const isAccounting = can.editFinancials(user);
  const params = await searchParams;
  const tab: Tab = params.tab === "sin-asignar" || (params.tab === "ingresar" && isAccounting) ? (params.tab as Tab) : "pagos";
  const f = parsePaymentFilters(params, scopedSede);

  const [summary, list, poolEntries, pendingPayments] = await Promise.all([
    getPaymentSummary(scopedSede ?? undefined),
    tab === "pagos" ? listPayments(f) : null,
    tab === "sin-asignar" ? getPoolEntries(scopedSede ?? undefined) : Promise.resolve([]),
    tab === "sin-asignar" ? getPendingMemberPayments(scopedSede ?? undefined) : Promise.resolve([]),
  ]);

  // Links keep the current filters; `patch` overrides some of them.
  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/dashboard/pagos${q.size ? `?${q}` : ""}`;
  };
  const here = href({});

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "pagos", label: "Cobros registrados" },
    { key: "sin-asignar", label: "Sin asignar", count: summary.poolCount + summary.pendingCount },
    ...(isAccounting ? [{ key: "ingresar" as Tab, label: "Ingresar del banco" }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title="Cobros de socios"
        subtitle={`Lo que pagan los socios, si ya está en el banco y si ya tiene factura.${scopedSede ? ` · ${ENTITIES[scopedSede].name}` : ""}`}
      >
        {isAccounting && (
          <Link
            href="/dashboard/facturas/nueva"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 text-sm font-medium hover:border-stone-500"
          >
            <FileText className="size-4" /> Cobrar y facturar
          </Link>
        )}
        <Link
          href="/dashboard/pagos/nuevo"
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: TEAL }}
        >
          <Plus className="size-4" /> Registrar pago
        </Link>
      </PageHeader>

      <nav className="flex gap-1 border-b" aria-label="Vistas de pagos">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "pagos" ? "/dashboard/pagos" : `/dashboard/pagos?tab=${t.key}`}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              tab === t.key ? "font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t.key ? { borderColor: TEAL } : undefined}
          >
            {t.label}
            {!!t.count && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{t.count}</span>}
          </Link>
        ))}
      </nav>

      {tab === "pagos" && list && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <RangeFilter desde={f.desde} hasta={f.hasta} rango={f.rango} />
            {!scopedSede && (
              <div className="flex rounded-full border bg-stone-50 p-0.5 text-xs" role="tablist" aria-label="Sede">
                {[null, ...ENTITY_ORDER].map((s) => (
                  <Link
                    key={s ?? "todas"}
                    href={href({ sede: s })}
                    role="tab"
                    aria-selected={f.sede === s}
                    className={`rounded-full px-3 py-1.5 font-medium transition ${f.sede === s ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {s ? SEDE_SHORT[s] : "Todas las sedes"}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Cobrado y confirmado"
              value={fmtMoney(list.confirmedCents)}
              sub={`${list.confirmedCount} cobros`}
              href={href({ estado: "confirmado" })}
              icon={Banknote}
              color={TEAL}
            />
            <Stat
              label="Sin depositar"
              value={fmtMoney(list.pendingCents)}
              sub={`${list.pendingCount} por confirmar con el banco`}
              href={href({ estado: "pendiente" })}
              icon={Hourglass}
              color={list.pendingCount ? "#d97e0a" : TEAL}
            />
            <Stat
              label="Sin factura"
              value={String(list.uninvoiced)}
              sub="Se factura al cobrar"
              href={href({ factura: "sin" })}
              icon={Receipt}
              color={list.uninvoiced ? "#e5533f" : TEAL}
            />
            <Stat
              label="Sin conciliar con el banco"
              value={String(list.unreconciled)}
              sub="Transferencias y tarjetas"
              href={href({ banco: "sin" })}
              icon={Landmark}
              color={list.unreconciled ? "#2f6fb0" : TEAL}
            />
          </div>

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <FilterBar filters={FILTERS} searchPlaceholder="Socio, quien pagó o referencia…" />
            {list.rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No hay cobros con estos filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Fecha</th>
                      <th className="px-3 py-2.5 font-medium">Socio</th>
                      <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Pagó</th>
                      <th className="hidden px-3 py-2.5 font-medium md:table-cell">Forma</th>
                      <th className="px-3 py-2.5 font-medium">Estado</th>
                      <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Banco</th>
                      <th className="px-3 py-2.5 font-medium">Factura</th>
                      {!scopedSede && <th className="hidden px-3 py-2.5 font-medium xl:table-cell">Sede</th>}
                      <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                      <th className="px-4 py-2.5 text-right font-medium" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((p) => {
                      const st = STATUS[p.status] ?? STATUS.PENDING;
                      const StIcon = st.icon;
                      const invoice = p.invoice && p.invoice.status !== "VOIDED" ? p.invoice : null;
                      const reconciled = !!(p.bankTransactionId || p.reconciledAt);
                      const memberName = p.member ? `${p.member.firstName} ${p.member.lastName}` : "";
                      const billedOther = invoice && invoice.buyerName.toLowerCase() !== memberName.toLowerCase() ? invoice.buyerName : null;
                      const locked = invoice ? "Tiene factura: anúlala primero en Facturación." : reconciled ? "Conciliado con el banco: deshaz la conciliación primero." : null;
                      return (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-stone-50">
                          <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{fmtDay(p.paidAt ?? p.createdAt)}</td>
                          <td className="px-3 py-2.5">
                            {p.member ? (
                              <Link href={`/dashboard/socios/${p.member.id}`} className="font-medium hover:underline">{memberName}</Link>
                            ) : (
                              "—"
                            )}
                            <p className="text-xs text-muted-foreground">
                              {p.membership?.plan?.name ?? "Sin membresía"}
                              {billedOther && <> · factura a <span className="text-foreground">{billedOther}</span></>}
                            </p>
                          </td>
                          <td className="hidden max-w-44 truncate px-3 py-2.5 text-muted-foreground lg:table-cell" title={p.bankReference ? `Ref. ${p.bankReference}` : undefined}>
                            {p.depositorName ?? "—"}
                          </td>
                          <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{METHOD_LABELS[p.method] ?? p.method}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${st.cls}`}>
                              <StIcon className="size-3" />
                              {st.label}
                            </span>
                          </td>
                          <td className="hidden px-3 py-2.5 sm:table-cell">
                            {reconciled ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#2f6fb0]"><Landmark className="size-3.5" />Conciliado</span>
                            ) : p.method === "CASH" ? (
                              <span className="text-xs text-muted-foreground">Efectivo</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {invoice ? (
                              <Link href={`/dashboard/facturas/${invoice.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline">
                                <CircleCheck className="size-3.5" />
                                <span title={formatDocNumber(invoice.emissionPoint.establishment, invoice.emissionPoint.point, invoice.sequential)}>N.º {invoice.sequential}</span>
                              </Link>
                            ) : isAccounting ? (
                              <Link
                                href={`/dashboard/facturas/nueva?pago=${p.id}`}
                                className="inline-flex items-center gap-1 rounded-full border border-[#0f9f8f]/40 px-2 py-0.5 text-xs font-medium text-[#0b7d71] hover:bg-[#0f9f8f]/10"
                              >
                                <Upload className="size-3" /> Facturar
                              </Link>
                            ) : (
                              <span className="text-xs text-amber-700">Sin factura</span>
                            )}
                          </td>
                          {!scopedSede && <td className="hidden px-3 py-2.5 text-muted-foreground xl:table-cell">{SEDE_SHORT[p.sede]}</td>}
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums">{fmtMoney(p.amountCents, { decimals: true })}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <Link href={`/dashboard/pagos/${p.id}?volver=${encodeURIComponent(here)}`} className="text-xs text-muted-foreground hover:text-foreground">
                                editar
                              </Link>
                              {locked ? (
                                <span title={locked} className="text-muted-foreground/60"><Lock className="size-3.5" /></span>
                              ) : (
                                <DeleteButton
                                  action={deletePayment.bind(null, p.id)}
                                  label="eliminar"
                                  confirmText={`¿Eliminar el cobro de ${memberName} por ${fmtMoney(p.amountCents, { decimals: true })}? Sale de la contabilidad del mes.`}
                                />
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
              <Pager page={list.page} totalPages={list.totalPages} total={list.total} noun="cobros" />
            </div>
          </section>

          {list.byMethod.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Por forma de pago:{" "}
              {list.byMethod.map((m, i) => (
                <span key={m.method}>
                  {i > 0 && " · "}
                  <Link href={href({ metodo: m.method })} className="hover:underline">
                    {METHOD_LABELS[m.method]} {fmtMoney(m.cents)}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </>
      )}

      {tab === "sin-asignar" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title={`Fondos sin depositar · ${pendingPayments.length}`}>
            <p className="-mt-1 mb-3 text-xs text-muted-foreground">Cobros registrados en recepción que aún no se confirman en el banco.</p>
            {pendingPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin fondos pendientes.</p>
            ) : (
              <ul className="divide-y">
                {pendingPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {p.member?.firstName} {p.member?.lastName}
                        {p.membership && <span className="ml-1 text-xs font-normal text-muted-foreground">· {p.membership.plan.name}</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {fmtDay(p.paidAt ?? p.createdAt)} · {METHOD_LABELS[p.method] ?? p.method}
                        {p.depositorName && ` · ${p.depositorName}`}
                        {p.bankReference && ` · Ref. ${p.bankReference}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold tabular-nums">{fmtMoney(p.amountCents, { decimals: true })}</span>
                      <Link
                        href={`/dashboard/pagos/${p.id}/confirmar?volver=${encodeURIComponent("/dashboard/pagos?tab=sin-asignar")}`}
                        className="rounded-full border border-[#0f9f8f]/40 px-2.5 py-0.5 text-xs font-medium text-[#0b7d71] hover:bg-[#0f9f8f]/10"
                      >
                        Confirmar
                      </Link>
                      <DeleteButton action={deletePendingPayment.bind(null, p.id)} label="eliminar" confirmText="¿Eliminar este cobro sin depositar?" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Depósitos del banco sin asignar · ${poolEntries.length}`}>
            <p className="-mt-1 mb-3 text-xs text-muted-foreground">Transferencias y pagos que entraron al banco y aún no se vinculan a un socio.</p>
            {poolEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin depósitos pendientes.{" "}
                {isAccounting && (
                  <Link href="/dashboard/pagos?tab=ingresar" className="text-[#2f6fb0] hover:underline">
                    Ingresar del banco ›
                  </Link>
                )}
              </p>
            ) : (
              <ul className="divide-y">
                {poolEntries.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.depositorName ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {fmtDay(p.paidAt)}
                        {p.bankEntity && ` · ${p.bankEntity}`}
                        {p.bankReference && ` · Ref. ${p.bankReference}`}
                        {!scopedSede && ` · ${SEDE_SHORT[p.sede]}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold tabular-nums">{fmtMoney(p.amountCents, { decimals: true })}</span>
                      <span className="text-xs text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</span>
                      {isAccounting && <DeleteButton action={deletePoolEntry.bind(null, p.id)} label="eliminar" confirmText="¿Eliminar este depósito sin asignar?" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "ingresar" && isAccounting && (
        <Panel title="Ingresar pagos del banco o de la pasarela">
          <p className="-mt-1 mb-4 text-sm text-muted-foreground">
            Copia y pega desde el extracto bancario o la pasarela. Lo guardado aparece en <strong>Sin asignar</strong>.
          </p>
          <PoolEntryForm defaultSede={user.sede ?? "FITNESS_CENTER"} canPickSede={isAccounting} />
        </Panel>
      )}
    </div>
  );
}
