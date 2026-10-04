import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, Banknote, CircleCheck, Landmark, ListChecks, Upload, Wallet } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { bankOverview, type AccountSummary } from "@/lib/actions/bank";
import { syncAccounting } from "@/lib/actions/accounting";
import { ENTITIES, ENTITY_ORDER, fmtMoney } from "@/lib/finance/entities";
import { parseEntityView, type EntityView } from "@/lib/finance/home";
import { ecuadorDateString } from "@/lib/timezone";
import { EntityPills, PageHeader } from "../../page-header";
import { Panel, Stat } from "../../blocks";
import { CashFlowChart } from "../home-charts";
import { mayorHref } from "../../contabilidad/links";

export const dynamic = "force-dynamic";

const BLUE = "#3a8fd1";
const DAY = 86_400_000;

const shortDay = (d: Date | null) =>
  d ? d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "2-digit", timeZone: "America/Guayaquil" }) : "—";
const money = (c: number) => fmtMoney(c, { decimals: true });

function AccountRow({ a, today }: { a: AccountSummary; today: string }) {
  const mixed = a.kind === "PERSONAL_MIXED";
  const diff = a.bankCents !== null && a.bookCents !== null ? a.bankCents - a.bookCents : null;
  const unexplained = diff === null ? null : diff - a.pendingCents - a.offBooksCents;
  const staleDays = a.lastPostedAt ? Math.floor((Date.parse(today) - Date.parse(ecuadorDateString(a.lastPostedAt))) / DAY) : null;
  const nextFrom = a.lastPostedAt ? ecuadorDateString(new Date(a.lastPostedAt.getTime() + DAY)) : null;
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[1.3fr_1fr_1fr_1.2fr] md:items-start">
      <div className="min-w-0">
        <Link href={`/dashboard/finanzas/banco/movimientos?cuenta=${a.id}`} className="font-medium hover:underline">
          {a.name}
          {a.last4 && <span className="text-muted-foreground"> ··{a.last4}</span>}
        </Link>
        <p className="text-xs text-muted-foreground">
          {a.bank} · {ENTITIES[a.sede].name}
          {mixed && " · cuenta personal mezclada"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {a.lines === 0 ? (
            <span className="text-amber-700">Todavía sin extractos</span>
          ) : (
            <>
              {shortDay(a.firstPostedAt)} → {shortDay(a.lastPostedAt)} · {a.lines} movimientos
              {staleDays !== null && staleDays > 7 && <span className="text-amber-700"> · sube desde el {nextFrom}</span>}
            </>
          )}
        </p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Según el banco</p>
        <p className="font-semibold tabular-nums">{a.bankCents === null ? "—" : money(a.bankCents)}</p>
        {a.bankAsOf && <p className="text-xs text-muted-foreground">al {shortDay(a.bankAsOf)}</p>}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{mixed ? "Del gimnasio en libros" : "En libros"}</p>
        <p className="font-semibold tabular-nums">{a.bookCents === null ? "—" : money(a.bookCents)}</p>
        {a.bookCents === null && <p className="text-xs text-amber-700">Sin cuenta contable: corre el plan de cuentas</p>}
      </div>
      <div className="text-xs">
        {a.lines === 0 ? (
          <Link href={`/dashboard/finanzas/banco/importar?cuenta=${a.id}`} className="font-medium text-[#2f6fb0] hover:underline">Subir el primer extracto →</Link>
        ) : mixed ? (
          <p className="text-muted-foreground">Lo personal no entra a la contabilidad: aquí los saldos no se comparan. {a.pendingCount > 0 ? "" : "Todo clasificado."}</p>
        ) : diff === 0 ? (
          <p className="inline-flex items-center gap-1 font-medium text-emerald-700"><CircleCheck className="size-3.5" /> Cuadra con el banco</p>
        ) : (
          <div className="space-y-0.5">
            <p>Diferencia <span className="font-semibold tabular-nums">{diff === null ? "—" : money(diff)}</span></p>
            {a.pendingCents !== 0 && <p className="text-muted-foreground">Por clasificar: <span className="tabular-nums">{money(a.pendingCents)}</span></p>}
            {a.offBooksCents !== 0 && <p className="text-muted-foreground">Ignorados: <span className="tabular-nums">{money(a.offBooksCents)}</span></p>}
            {unexplained !== null && unexplained !== 0 && (
              <p className="text-amber-700">
                Sin explicar: <span className="tabular-nums">{money(unexplained)}</span>
                {a.firstPostedAt && ecuadorDateString(a.firstPostedAt) > `${today.slice(0, 4)}-01-05` && " — faltan los extractos desde enero"}
              </p>
            )}
          </div>
        )}
        {a.pendingCount > 0 && (
          <Link href={`/dashboard/finanzas/banco/conciliar?cuenta=${a.id}`} className="mt-1 inline-block font-medium text-[#2f6fb0] hover:underline">
            Conciliar {a.pendingCount} →
          </Link>
        )}
      </div>
    </li>
  );
}

export default async function CajaBancosPage({ searchParams }: { searchParams: Promise<{ entidad?: string; cuenta?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const sp = await searchParams;
  // Old links (?cuenta=) pointed at the inbox of one account.
  if (sp.cuenta) redirect(`/dashboard/finanzas/banco/movimientos?cuenta=${sp.cuenta}`);
  const view = parseEntityView(sp.entidad);
  const sedes = view === "ALL" ? ENTITY_ORDER : [view];
  const href = (v: EntityView) => `/dashboard/finanzas/banco${v === "ALL" ? "" : `?entidad=${v}`}`;
  const today = ecuadorDateString();

  // Book balances come from the journal: bring it up to date first.
  const syncErrors: string[] = [];
  for (const s of sedes) {
    try {
      const r = await syncAccounting(s);
      syncErrors.push(...r.errors);
    } catch (e) {
      syncErrors.push(e instanceof Error ? e.message : String(e));
    }
  }
  const o = await bankOverview(sedes);

  const pending = o.accounts.reduce((n, a) => n + a.pendingCount, 0);
  const withBalance = o.accounts.filter((a) => a.bankCents !== null);
  const inBanks = withBalance.reduce((n, a) => n + (a.bankCents ?? 0), 0);
  const ledger = (code: string) => o.ledger.filter((l) => l.code === code);
  const total = (code: string) => ledger(code).reduce((n, l) => n + l.cents, 0);
  const mayor = (code: string) => {
    const rows = ledger(code);
    return rows.length === 1 ? mayorHref(rows[0].sede, rows[0].accountId, `${today.slice(0, 4)}-01-01`, today) : undefined;
  };
  const inTransit = total("1.1.07");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Caja y Bancos" subtitle="Saldos de cada cuenta frente a los libros. Sube el extracto, clasifica cada movimiento una vez y la contabilidad se hace sola.">
        <EntityPills view={view} href={href} />
        {can.editFinancials(user) && (
          <Link href="/dashboard/finanzas/banco/importar" className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: BLUE }}>
            <Upload className="size-4" /> Subir extracto
          </Link>
        )}
      </PageHeader>

      {syncErrors.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Hay movimientos que no se pudieron contabilizar; los saldos en libros pueden estar incompletos.</p>
            <p className="text-xs">{syncErrors.slice(0, 3).join(" · ")}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Por conciliar"
          value={String(pending)}
          sub={pending ? "Movimientos del banco sin clasificar" : "Todo clasificado"}
          href="/dashboard/finanzas/banco/conciliar"
          icon={ListChecks}
          color={pending ? "#d97e0a" : "#0f9f8f"}
        />
        <Stat
          label="En bancos"
          value={withBalance.length ? fmtMoney(inBanks) : "—"}
          sub={withBalance.length ? "Último saldo de cada extracto" : "Sube los extractos para verlo"}
          icon={Landmark}
          color={BLUE}
        />
        <Stat label="Caja (efectivo)" value={fmtMoney(total("1.1.01"))} sub="Cobros en efectivo menos lo pagado en efectivo" href={mayor("1.1.01")} icon={Wallet} color="#0f9f8f" />
        <Stat
          label="Por ver en el banco"
          value={fmtMoney(total("1.1.05"))}
          sub="Transferencias y tarjetas registradas que aún no salen en un extracto"
          href={mayor("1.1.05")}
          icon={Banknote}
          color="#6b4fb5"
        />
      </div>

      <Panel title="Cuentas" aside={can.editFinancials(user) && <Link href="/dashboard/finanzas/banco/nueva-cuenta" className="font-medium text-[#2f6fb0] hover:underline">+ Agregar cuenta</Link>}>
        {o.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cuentas bancarias registradas.</p>
        ) : (
          <ul className="divide-y">
            {o.accounts.map((a) => (
              <AccountRow key={a.id} a={a} today={today} />
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Entradas y salidas por los bancos" className="lg:col-span-2" aside="Sin movimientos personales ni entre cuentas">
          <div className="h-56">
            <CashFlowChart
              data={o.months.map((m) => ({ ym: m.ym, incomeCents: m.inCents, expensesCents: m.outCents }))}
              current={today.slice(0, 7)}
              basePath={`/dashboard/finanzas/banco/movimientos${view === "ALL" ? "" : `?entidad=${view}`}`}
            />
          </div>
        </Panel>
        <Panel title="Para cuadrar">
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2">
              <Upload className="mt-0.5 size-4 shrink-0 text-stone-500" />
              <span>Sube cada semana el extracto de cada cuenta (el mismo archivo dos veces no duplica nada).</span>
            </li>
            <li className="flex gap-2">
              <ListChecks className="mt-0.5 size-4 shrink-0 text-stone-500" />
              <span>Clasifica la bandeja: cobros de socios, gastos, sueldos, IESS, SRI, dueños, préstamos.</span>
            </li>
            <li className="flex gap-2">
              <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-stone-500" />
              <span>
                Transferencias entre cuentas propias en tránsito:{" "}
                <span className={`font-medium tabular-nums ${inTransit ? "text-amber-700" : ""}`}>{money(inTransit)}</span>
                {inTransit !== 0 && " — falta clasificar la otra pata (o subir el extracto de la otra cuenta)."}
              </span>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
