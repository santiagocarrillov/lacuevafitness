import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ListChecks, X } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { listBankAccounts, listTransactions } from "@/lib/actions/bank";
import { decisionLabel, type Decision } from "@/lib/finance/bank-suggest";
import { TXN_KIND_LABELS, parseTxnFilters } from "@/lib/finance/bank-filters";
import { ENTITY_ORDER, fmtMoney } from "@/lib/finance/entities";
import { ecuadorDateString } from "@/lib/timezone";
import { FilterBar, Pager, type FilterDef } from "@/components/list/filter-bar";
import { RangeFilter } from "@/components/list/range-filter";
import { PageHeader } from "../../../page-header";
import { Stat } from "../../../blocks";

export const dynamic = "force-dynamic";

type Params = Record<string, string | undefined>;
const SEDE_SHORT: Record<string, string> = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" };

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const f = parseTxnFilters(params);
  const [accounts, list] = await Promise.all([listBankAccounts(), listTransactions(f, ENTITY_ORDER)]);
  const account = f.cuenta ? accounts.find((a) => a.id === f.cuenta) : null;

  const href = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    return `/dashboard/finanzas/banco/movimientos${q.size ? `?${q}` : ""}`;
  };

  const filters: FilterDef[] = [
    { name: "cuenta", title: "Cuenta", options: accounts.map((a) => ({ value: a.id, label: `${a.name}${a.last4 ? ` ··${a.last4}` : ""}` })) },
    { name: "estado", title: "Estado", options: [{ value: "pendiente", label: "Por clasificar" }, { value: "clasificado", label: "Clasificado" }, { value: "ignorado", label: "Ignorado" }] },
    { name: "tipo", title: "Tipo", options: Object.entries(TXN_KIND_LABELS).map(([value, label]) => ({ value, label })) },
    { name: "dir", title: "Dirección", options: [{ value: "entradas", label: "Entradas" }, { value: "salidas", label: "Salidas" }] },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={account ? `${account.name}${account.last4 ? ` ··${account.last4}` : ""}` : "Movimientos"}
        subtitle="Cada línea de los extractos importados, con lo que se hizo con ella. Clic en una para ver el detalle o clasificarla."
      />

      <div className="flex flex-wrap items-center gap-3">
        <RangeFilter desde={f.desde} hasta={f.hasta} rango={f.rango} />
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
        {account && (
          <Link href={href({ cuenta: null })} className="inline-flex items-center gap-1 rounded-full border border-[#3a8fd1]/40 bg-[#3a8fd1]/10 px-3 py-1 text-xs font-medium text-[#1f5f91]">
            Cuenta: {account.name} <X className="size-3" />
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Entradas" value={fmtMoney(list.inCents)} sub="En el período y filtros" href={href({ dir: "entradas" })} icon={ArrowDownLeft} color="#0f9f8f" />
        <Stat label="Salidas" value={fmtMoney(list.outCents)} sub="En el período y filtros" href={href({ dir: "salidas" })} icon={ArrowUpRight} color="#e5533f" />
        <Stat label="Movimientos" value={list.total.toLocaleString("es-EC")} sub="Ver los que faltan por clasificar" href={href({ estado: "pendiente" })} icon={ListChecks} color="#3a8fd1" />
      </div>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <FilterBar filters={filters} searchPlaceholder="Nombre, descripción o referencia…" />
        {list.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {accounts.some((a) => a.lastPostedAt) ? "No hay movimientos con estos filtros." : "Todavía no se ha subido ningún extracto."}{" "}
            {can.editFinancials(user) && (
              <Link href="/dashboard/finanzas/banco/importar" className="font-medium text-[#2f6fb0] hover:underline">Subir extracto</Link>
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-stone-50/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-3 py-2.5 font-medium">Movimiento</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Cuenta</th>
                  <th className="px-3 py-2.5 font-medium">Clasificación</th>
                  <th className="px-3 py-2.5 text-right font-medium">Monto</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const d = (r.appliedJson as { decision?: Decision } | null)?.decision;
                  const link = `/dashboard/finanzas/banco/movimientos/${r.id}`;
                  return (
                    <tr key={r.id} className="border-b align-top last:border-0 hover:bg-stone-50">
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{ecuadorDateString(r.postedAt)}</td>
                      <td className="px-3 py-2.5">
                        <Link href={link} className="font-medium hover:underline">{r.counterparty ?? r.description}</Link>
                        {r.counterparty && <p className="text-xs text-muted-foreground">{r.description}</p>}
                      </td>
                      <td className="hidden px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">
                        {r.account.name}
                        {r.account.last4 && ` ··${r.account.last4}`}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.status === "PENDING" ? (
                          <Link href={link} className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">Por clasificar</Link>
                        ) : r.status === "IGNORED" ? (
                          <span className="text-xs text-muted-foreground">Ignorado</span>
                        ) : (
                          <span className="text-xs">{d ? decisionLabel(d) : r.kind ? TXN_KIND_LABELS[r.kind] : "Clasificado"}</span>
                        )}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums ${r.amountCents > 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {fmtMoney(r.amountCents, { decimals: true })}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted-foreground md:table-cell">
                        {r.balanceCents === null ? "" : fmtMoney(r.balanceCents, { decimals: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t">
          <Pager page={list.page} totalPages={list.totalPages} total={list.total} noun="movimientos" />
        </div>
      </section>
    </div>
  );
}
