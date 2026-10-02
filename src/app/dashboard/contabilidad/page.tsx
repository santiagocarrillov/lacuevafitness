import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import type { Sede } from "@/generated/prisma/enums";
import { ENTITIES, ENTITY_ORDER, monthLabel, monthRangeUtc, shiftMonth } from "@/lib/finance/entities";
import { getAccounts, getLockedThrough, syncAccounting } from "@/lib/actions/accounting";
import { PeriodControls } from "./period-controls";
import { DiarioTab } from "./diario-tab";
import { MayorTab } from "./mayor-tab";
import { ComprobacionTab } from "./comprobacion-tab";
import { EstadosTab } from "./estados-tab";
import { PlanTab } from "./plan-tab";
import { EntryForm } from "./entry-form";
import { ActivosTab } from "./activos-tab";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "estados", label: "Estados financieros" },
  { key: "diario", label: "Libro diario" },
  { key: "nuevo", label: "Nuevo asiento" },
  { key: "mayor", label: "Mayor" },
  { key: "comprobacion", label: "Balance de comprobación" },
  { key: "activos", label: "Activos fijos" },
  { key: "plan", label: "Plan de cuentas" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; mes?: string; entidad?: string; cuenta?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const canEdit = can.editFinancials(user);

  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "estados";
  const sede: Sede = params.entidad === "FITNESS_CENTER" ? "FITNESS_CENTER" : "XTREME";
  const thisMonth = ecuadorDateString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : thisMonth;
  const { start, end } = monthRangeUtc(ym);
  const from = start.toISOString().slice(0, 10);
  const to = new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10);

  const href = (u: Record<string, string>) =>
    `/dashboard/contabilidad?${new URLSearchParams({ tab, mes: ym, entidad: sede, ...(params.cuenta ? { cuenta: params.cuenta } : {}), ...u }).toString()}`;

  const needsAccounts = tab === "nuevo" || tab === "mayor" || tab === "plan";
  // Documents post themselves: bring the journal up to date before any report.
  const [accounts, sync, locked] = await Promise.all([
    needsAccounts ? getAccounts(sede) : Promise.resolve([]),
    tab === "plan" || tab === "nuevo" ? Promise.resolve(null) : syncAccounting(sede),
    getLockedThrough(sede),
  ]);
  const monthEnded = to < ecuadorDateString();
  const canClose = canEdit && monthEnded && (!locked || locked < to);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Contabilidad</h1>
          <p className="text-sm text-muted-foreground">
            Libro diario de partida doble · {ENTITIES[sede].legalName}
            {ENTITIES[sede].ruc && ` · RUC ${ENTITIES[sede].ruc}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            {ENTITY_ORDER.map((s) => (
              <Link
                key={s}
                href={href({ entidad: s, cuenta: "" })}
                className={`rounded-full border px-3 py-1 text-xs ${s === sede ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
              >
                {ENTITIES[s].name}
              </Link>
            ))}
          </div>
          <nav className="flex items-center gap-1 text-sm" aria-label="Mes">
            <Link href={href({ mes: shiftMonth(ym, -1) })} className="rounded-md border px-2.5 py-1.5 hover:bg-muted">←</Link>
            <span className="min-w-32 text-center font-medium capitalize">{monthLabel(ym)}</span>
            <Link
              href={href({ mes: shiftMonth(ym, 1) })}
              aria-disabled={ym >= thisMonth}
              className={`rounded-md border px-2.5 py-1.5 hover:bg-muted ${ym >= thisMonth ? "pointer-events-none opacity-40" : ""}`}
            >
              →
            </Link>
          </nav>
        </div>
      </header>

      <PeriodControls
        sede={sede}
        ym={ym}
        monthName={monthLabel(ym)}
        lockedThrough={locked}
        canClose={canClose}
        isOwner={user.role === "OWNER"}
      />

      {sync && (sync.created > 0 || sync.voided > 0 || sync.locked.length > 0 || sync.errors.length > 0) && (
        <div className={`rounded-md border p-3 text-xs space-y-1 ${sync.errors.length || sync.locked.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
          {(sync.created > 0 || sync.voided > 0) && (
            <p>Contabilizado ahora: {sync.created} asientos nuevos{sync.voided ? `, ${sync.voided} reemplazados o anulados porque su documento cambió` : ""}.</p>
          )}
          {sync.locked.length > 0 && (
            <p>
              {sync.locked.length} cambio(s) en meses cerrados no se aplicaron (p. ej. «{sync.locked[0]}»). Si corresponden,
              reabre el mes o registra un ajuste en el mes abierto.
            </p>
          )}
          {sync.errors.length > 0 && <p>No se pudieron contabilizar {sync.errors.length}: {sync.errors[0]}</p>}
        </div>
      )}

      <div className="border-b flex gap-1 overflow-x-auto">
        {TABS.filter((t) => t.key !== "nuevo" || canEdit).map((t) => (
          <Link
            key={t.key}
            href={href({ tab: t.key })}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "estados" && <EstadosTab sede={sede} asOf={to} ym={ym} />}
      {tab === "activos" && <ActivosTab sede={sede} canEdit={canEdit} />}
      {tab === "diario" && <DiarioTab sede={sede} from={from} to={to} canEdit={canEdit} />}
      {tab === "nuevo" && canEdit && (
        <EntryForm
          sede={sede}
          defaultDate={ym === thisMonth ? ecuadorDateString() : to}
          accounts={accounts.filter((a) => a.postable && a.active).map((a) => ({ id: a.id, code: a.code, name: a.name }))}
        />
      )}
      {tab === "mayor" && (
        <MayorTab
          sede={sede}
          from={from}
          to={to}
          accountId={params.cuenta}
          accounts={accounts.filter((a) => a.postable).map((a) => ({ id: a.id, code: a.code, name: a.name }))}
          hrefBase={`/dashboard/contabilidad?tab=mayor&mes=${ym}&entidad=${sede}`}
        />
      )}
      {tab === "comprobacion" && <ComprobacionTab sede={sede} from={from} to={to} />}
      {tab === "plan" && <PlanTab accounts={accounts} />}
    </div>
  );
}
