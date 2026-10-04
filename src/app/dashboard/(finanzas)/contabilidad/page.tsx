import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import type { Sede } from "@/generated/prisma/enums";
import { ENTITIES, ENTITY_ORDER, monthLabel, monthRangeUtc } from "@/lib/finance/entities";
import { EntityPills, MonthNav, PageHeader } from "../page-header";
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
  searchParams: Promise<{ tab?: string; mes?: string; entidad?: string; cuenta?: string; desde?: string; hasta?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const canEdit = can.editFinancials(user);

  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "estados";
  // Only the statements can be consolidated; every other screen is one company's books.
  const consolidated = tab === "estados" && params.entidad === "CONSOLIDADO";
  const sede: Sede = params.entidad === "FITNESS_CENTER" ? "FITNESS_CENTER" : "XTREME";
  const thisMonth = ecuadorDateString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : thisMonth;
  const { start, end } = monthRangeUtc(ym);
  const from = start.toISOString().slice(0, 10);
  const to = new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10);
  // Drill-down from the statements opens the ledger for a custom range
  // (e.g. 1 Jan → cierre del mes); otherwise the selected month.
  const isDay = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const rangeFrom = isDay(params.desde) ? params.desde! : from;
  const rangeTo = isDay(params.hasta) ? params.hasta! : to;

  const entidad = consolidated ? "CONSOLIDADO" : sede;
  const href = (u: Record<string, string>) =>
    `/dashboard/contabilidad?${new URLSearchParams({ tab, mes: ym, entidad, ...(params.cuenta ? { cuenta: params.cuenta } : {}), ...u }).toString()}`;

  const needsAccounts = tab === "nuevo" || tab === "mayor" || tab === "plan";
  const skipSync = tab === "plan" || tab === "nuevo";
  // Documents post themselves: bring the journal up to date before any report.
  const [accounts, syncs, locked] = await Promise.all([
    needsAccounts ? getAccounts(sede) : Promise.resolve([]),
    skipSync ? Promise.resolve([]) : Promise.all((consolidated ? ENTITY_ORDER : [sede]).map((s) => syncAccounting(s))),
    getLockedThrough(sede),
  ]);
  const sync = syncs.length
    ? {
        created: syncs.reduce((a, x) => a + x.created, 0),
        voided: syncs.reduce((a, x) => a + x.voided, 0),
        locked: syncs.flatMap((x) => x.locked),
        errors: syncs.flatMap((x) => x.errors),
      }
    : null;
  const monthEnded = to < ecuadorDateString();
  const canClose = canEdit && monthEnded && (!locked || locked < to);
  const title = TABS.find((t) => t.key === tab)!.label;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader
        title={title}
        subtitle={
          consolidated
            ? `Consolidado · ${ENTITY_ORDER.map((s) => ENTITIES[s].name).join(" + ")} · sin eliminaciones entre empresas`
            : `Libro diario de partida doble · ${ENTITIES[sede].legalName}${ENTITIES[sede].ruc ? ` · RUC ${ENTITIES[sede].ruc}` : ""}`
        }
      >
        <EntityPills
          view={consolidated ? "ALL" : sede}
          consolidated={tab === "estados"}
          href={(v) => href({ entidad: v === "ALL" ? "CONSOLIDADO" : v, cuenta: "" })}
        />
        <MonthNav ym={ym} thisMonth={thisMonth} href={(m) => href({ mes: m })} />
      </PageHeader>

      {!consolidated && (
        <PeriodControls
          sede={sede}
          ym={ym}
          monthName={monthLabel(ym)}
          lockedThrough={locked}
          canClose={canClose}
          isOwner={user.role === "OWNER"}
        />
      )}

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

      {tab === "estados" && <EstadosTab sede={consolidated ? null : sede} asOf={to} ym={ym} />}
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
          from={rangeFrom}
          to={rangeTo}
          accountId={params.cuenta}
          accounts={accounts.filter((a) => a.postable).map((a) => ({ id: a.id, code: a.code, name: a.name }))}
          hrefBase={`/dashboard/contabilidad?tab=mayor&mes=${ym}&entidad=${sede}${rangeFrom !== from || rangeTo !== to ? `&desde=${rangeFrom}&hasta=${rangeTo}` : ""}`}
        />
      )}
      {tab === "comprobacion" && <ComprobacionTab sede={sede} from={from} to={to} />}
      {tab === "plan" && <PlanTab accounts={accounts} />}
    </div>
  );
}
