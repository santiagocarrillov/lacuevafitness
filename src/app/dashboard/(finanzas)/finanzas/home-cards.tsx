import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronRight } from "lucide-react";
import { ENTITIES, fmtMoney, monthLabel, shiftMonth } from "@/lib/finance/entities";
import type { HomeData, Slice } from "@/lib/finance/home";
import { CashFlowChart, DonutChart } from "./home-charts";
import { CATEGORICAL, EXPENSE_COLOR, INCOME_COLOR, OTHERS_GRAY } from "./chart-colors";

function Card({ title, aside, footer, children, className = "" }: { title: string; aside?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-600">{title}</h2>
        {aside && <div className="text-xs text-muted-foreground">{aside}</div>}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-4 border-t pt-3 text-sm">{footer}</div>}
    </section>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-[#2f6fb0] hover:underline">
      {children}
      <ChevronRight className="size-3.5" />
    </Link>
  );
}

function pctChange(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}

export function ProfitLossCard({ data, ym }: { data: HomeData; ym: string }) {
  const max = Math.max(data.incomeCents, data.expensesCents, 1);
  const change = pctChange(data.resultCents, data.prevYear.resultCents);
  const better = data.resultCents >= data.prevYear.resultCents;
  return (
    <Card
      title="Pérdidas y ganancias"
      aside={<span className="inline-block first-letter:uppercase">{monthLabel(ym)}</span>}
      footer={<FooterLink href={`/dashboard/finanzas/reportes/resultados?mes=${ym}`}>Ver el reporte completo</FooterLink>}
    >
      <p className={`text-3xl font-semibold tabular-nums tracking-tight ${data.resultCents < 0 ? "text-red-700" : ""}`}>{fmtMoney(data.resultCents)}</p>
      <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
        {data.prevYear.incomeCents || data.prevYear.expensesCents ? (
          <>
            {better ? <ArrowUpRight className="size-4 text-emerald-600" /> : <ArrowDownRight className="size-4 text-red-600" />}
            <span className={better ? "font-medium text-emerald-700" : "font-medium text-red-700"}>
              {fmtMoney(Math.abs(data.resultCents - data.prevYear.resultCents))}
              {change !== null && Math.abs(change) <= 200 && ` (${Math.abs(change)} %)`}
            </span>
            {better ? "más" : "menos"} que en {monthLabel(shiftMonth(ym, -12))}
          </>
        ) : (
          "Resultado del mes (ingresos − gastos)"
        )}
      </p>
      <div className="mt-5 space-y-4">
        {[
          { label: "Ingresos", cents: data.incomeCents, color: INCOME_COLOR, href: `/dashboard/finanzas/reportes/resultados?mes=${ym}` },
          { label: "Gastos", cents: data.expensesCents, color: EXPENSE_COLOR, href: `/dashboard/gastos?mes=${ym}` },
        ].map((b) => (
          <Link key={b.label} href={b.href} className="group block">
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground group-hover:text-foreground">{b.label}</span>
              <span className="font-medium tabular-nums">{fmtMoney(b.cents)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full transition-all" style={{ width: `${(b.cents / max) * 100}%`, backgroundColor: b.color }} />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** Top 5 categories in fixed colour order; the rest fold into "Otros". */
function colored(slices: Slice[]) {
  const top = slices.slice(0, 5).map((s, i) => ({ ...s, color: CATEGORICAL[i] }));
  const rest = slices.slice(5);
  if (rest.length) top.push({ label: "Otros", cents: rest.reduce((a, s) => a + s.cents, 0), href: rest[0].href, color: OTHERS_GRAY });
  return top;
}

export function BreakdownCard({ title, slices, totalCents, footer, empty }: { title: string; slices: Slice[]; totalCents: number; footer: ReactNode; empty: ReactNode }) {
  const rows = colored(slices);
  return (
    <Card title={title} footer={footer}>
      <p className="text-3xl font-semibold tabular-nums tracking-tight">{fmtMoney(totalCents)}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-4 flex items-center gap-5">
          <DonutChart slices={rows} totalLabel="del mes" />
          <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
            {rows.map((r) => (
              <li key={r.label}>
                <Link href={r.href} className="group flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: r.color }} />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground group-hover:text-foreground">{r.label}</span>
                  <span className="tabular-nums font-medium">{fmtMoney(r.cents)}</span>
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                    {totalCents ? Math.round((r.cents / totalCents) * 100) : 0}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function CashFlowCard({ data, ym }: { data: HomeData; ym: string }) {
  const totalIn = data.trend.reduce((a, r) => a + r.incomeCents, 0);
  const totalOut = data.trend.reduce((a, r) => a + r.expensesCents, 0);
  return (
    <Card
      title="Flujo del negocio · últimos 12 meses"
      className="lg:col-span-2"
      aside={
        <div className="flex gap-3">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: INCOME_COLOR }} />Entró</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ backgroundColor: EXPENSE_COLOR }} />Salió</span>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground">
            12 meses: entró <strong className="text-foreground tabular-nums">{fmtMoney(totalIn)}</strong> · salió{" "}
            <strong className="text-foreground tabular-nums">{fmtMoney(totalOut)}</strong>
          </span>
          <FooterLink href={`/dashboard/finanzas/reportes/resultados?mes=${ym}`}>Mes a mes por sede</FooterLink>
        </div>
      }
    >
      <div className="h-56">
        <CashFlowChart data={data.trend} current={ym} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Ingresos por fecha de cobro y gastos por fecha del documento. Toca un mes para abrirlo. Sin dinero de los dueños.</p>
    </Card>
  );
}

const shortDay = (d: Date | null) =>
  d ? d.toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "America/Guayaquil" }) : "—";

export function BanksCard({ data }: { data: HomeData }) {
  return (
    <Card title="Cuentas bancarias" footer={<FooterLink href="/dashboard/finanzas/banco">Ir a Caja y Bancos</FooterLink>}>
      {data.banks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cuentas registradas.</p>
      ) : (
        <ul className="divide-y">
          {data.banks.map((b) => (
            <li key={b.id}>
              <Link href={`/dashboard/finanzas/banco/movimientos?cuenta=${b.id}`} className="group block py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium group-hover:underline">
                    {b.name}
                    {b.last4 && <span className="text-muted-foreground"> ··{b.last4}</span>}
                  </span>
                  {b.pending > 0 ? (
                    <span className="shrink-0 text-xs font-medium text-[#2f6fb0]">{b.pending} por revisar</span>
                  ) : (
                    <span className="shrink-0 text-xs text-emerald-700">Al día</span>
                  )}
                </div>
                <div className="mt-0.5 grid grid-cols-2 text-xs text-muted-foreground">
                  <span>
                    Banco <span className="tabular-nums text-foreground">{b.bankCents === null ? "—" : fmtMoney(b.bankCents, { decimals: true })}</span>
                    {b.bankAsOf && <span> · {shortDay(b.bankAsOf)}</span>}
                  </span>
                  <span className="text-right">
                    En libros <span className="tabular-nums text-foreground">{fmtMoney(b.bookCents, { decimals: true })}</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function TaxesCard({ data, today }: { data: HomeData; today: string }) {
  const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
  const items = data.taxes.flatMap((t) => [
    t.ivaDue ? { sede: t.sede, what: "IVA · formulario 104", due: t.ivaDue } : null,
    t.atsDue ? { sede: t.sede, what: "Anexo transaccional (ATS)", due: t.atsDue } : null,
  ]).filter((x): x is { sede: HomeData["sedes"][number]; what: string; due: string } => !!x)
    .sort((a, b) => a.due.localeCompare(b.due));
  return (
    <Card title="Próximas obligaciones SRI" footer={<FooterLink href="/dashboard/finanzas/impuestos">Ver impuestos</FooterLink>}>
      <ul className="space-y-2.5">
        {items.map((i) => {
          const d = daysTo(i.due);
          return (
            <li key={`${i.sede}${i.what}`} className="flex items-center gap-3">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${d <= 5 ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                <CalendarClock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.what}</p>
                <p className="text-xs text-muted-foreground">{ENTITIES[i.sede].name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm tabular-nums first-letter:uppercase">{longDay(i.due)}</p>
                <p className={`text-xs ${d <= 5 ? "font-medium text-red-700" : "text-muted-foreground"}`}>{d === 0 ? "hoy" : `en ${d} días`}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">Fecha según el noveno dígito del RUC; si cae en fin de semana pasa al lunes. No incluye feriados.</p>
    </Card>
  );
}

export function PayablesCard({ data, today }: { data: HomeData; today: string }) {
  return (
    <Card
      title="Por pagar a proveedores"
      aside={data.todo.payablesCount ? <span className="tabular-nums">{fmtMoney(data.todo.payablesCents)}</span> : undefined}
      footer={<FooterLink href="/dashboard/gastos?ver=porpagar">Ver cuentas por pagar</FooterLink>}
    >
      {data.payablesTop.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cuentas por pagar.</p>
      ) : (
        <ul className="divide-y">
          {data.payablesTop.map((p) => {
            const due = p.dueDate?.toISOString().slice(0, 10);
            const late = !!due && due < today;
            return (
              <li key={p.id}>
                <Link href={`/dashboard/gastos/${p.id}`} className="group flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate group-hover:underline">{p.name}</span>
                    <span className={`text-xs ${late ? "font-medium text-red-700" : "text-muted-foreground"}`}>
                      {due ? `${late ? "Venció" : "Vence"} el ${due}` : "Sin fecha de vencimiento"}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{fmtMoney(p.amountCents, { decimals: true })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function OwnersCard({ data, ym }: { data: HomeData; ym: string }) {
  const net = data.capital.inCents - data.capital.outCents;
  return (
    <Card title="Dinero de los dueños" aside={<span className="inline-block first-letter:uppercase">{monthLabel(ym)}</span>} footer={<FooterLink href={`/dashboard/finanzas/aportes?mes=${ym}`}>Ver aportes y préstamos</FooterLink>}>
      <p className={`text-3xl font-semibold tabular-nums tracking-tight ${net < 0 ? "text-red-700" : ""}`}>{fmtMoney(net)}</p>
      <p className="mt-1 text-sm text-muted-foreground">Neto puesto por los dueños este mes. No es ingreso: es aporte o préstamo.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-stone-50 p-3">
          <dt className="text-xs text-muted-foreground">Aportes y préstamos</dt>
          <dd className="font-medium tabular-nums">{fmtMoney(data.capital.inCents)}</dd>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <dt className="text-xs text-muted-foreground">Devoluciones y retiros</dt>
          <dd className="font-medium tabular-nums">{fmtMoney(data.capital.outCents)}</dd>
        </div>
      </dl>
    </Card>
  );
}
