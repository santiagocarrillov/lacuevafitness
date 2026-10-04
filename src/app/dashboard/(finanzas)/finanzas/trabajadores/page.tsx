import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, CalendarClock, Dumbbell, IdCard, Plus, Users } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, ENTITY_ORDER, fmtMoney, monthLabel } from "@/lib/finance/entities";
import { parseEntityView, type EntityView } from "@/lib/finance/home";
import { PAYROLL_DEADLINES } from "@/lib/payroll/rules";
import { ecuadorDateString } from "@/lib/timezone";
import { EntityPills, PageHeader } from "../../page-header";
import { BarList, Panel, Stat } from "../../blocks";

export const dynamic = "force-dynamic";

const PURPLE = "#6b4fb5";

/** Next date (YYYY-MM-DD) on or after today for a yearly deadline. */
function nextYearly(today: string, month: number, day: number) {
  const y = Number(today.slice(0, 4));
  const d = (yy: number) => `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return d(y) >= today ? d(y) : d(y + 1);
}

export default async function TrabajadoresPage({ searchParams }: { searchParams: Promise<{ entidad?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const view = parseEntityView((await searchParams).entidad);
  const sedes = view === "ALL" ? ENTITY_ORDER : [view];
  const href = (v: EntityView) => `/dashboard/finanzas/trabajadores${v === "ALL" ? "" : `?entidad=${v}`}`;
  const today = ecuadorDateString();
  const year = Number(today.slice(0, 4));

  const [people, lastRun, runsYear, honorarios] = await Promise.all([
    prisma.employee.findMany({ where: { sede: { in: sedes }, active: true }, select: { employmentType: true, monthlySalaryCents: true } }),
    prisma.payrollRun.findFirst({
      where: { sede: { in: sedes }, status: { in: ["APPROVED", "PAID"] } },
      orderBy: { period: "desc" },
      include: { lines: true },
    }),
    prisma.payrollLine.findMany({
      where: { run: { sede: { in: sedes }, status: { in: ["APPROVED", "PAID"] }, period: { startsWith: String(year) } } },
      include: { employee: { select: { firstName: true, lastName: true } } },
    }),
    prisma.expense.findMany({
      where: { sede: { in: sedes }, voidedAt: null, category: "COACH_FEES", date: { gte: new Date(Date.UTC(year, 0, 1)) } },
      select: { amountCents: true, supplierName: true, description: true },
    }),
  ]);
  const dep = people.filter((p) => p.employmentType === "DEPENDENCIA").length;
  const hon = people.length - dep;
  const lineCost = (l: (typeof runsYear)[number]) => l.grossCents + l.iessEmployerCents + l.fondosReservaCents + l.decimoTerceroCents + l.decimoCuartoCents + l.vacationCents;
  const lastCost = lastRun?.lines.reduce((a, l) => a + l.grossCents + l.iessEmployerCents + l.fondosReservaCents + l.decimoTerceroCents + l.decimoCuartoCents + l.vacationCents, 0) ?? 0;
  const yearPayroll = runsYear.reduce((a, l) => a + lineCost(l), 0);
  const yearFees = honorarios.reduce((a, e) => a + e.amountCents, 0);

  const byPerson = new Map<string, number>();
  for (const l of runsYear) {
    const k = `${l.employee.firstName} ${l.employee.lastName}`;
    byPerson.set(k, (byPerson.get(k) ?? 0) + lineCost(l));
  }
  for (const e of honorarios) {
    const k = e.supplierName || e.description;
    byPerson.set(k, (byPerson.get(k) ?? 0) + e.amountCents);
  }
  const people$ = [...byPerson].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);

  const nextMonth15 = (() => {
    const [y, m] = today.split("-").map(Number);
    const thisOne = `${today.slice(0, 7)}-15`;
    return thisOne >= today ? thisOne : new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10);
  })();
  const deadlines = [
    { what: "Planilla del IESS (aportes del mes anterior)", due: nextMonth15 },
    { what: "Décimo cuarto (Sierra y Amazonía)", due: nextYearly(today, PAYROLL_DEADLINES.decimoCuartoSierra.month, PAYROLL_DEADLINES.decimoCuartoSierra.day) },
    { what: "Décimo tercero", due: nextYearly(today, PAYROLL_DEADLINES.decimoTercero.month, PAYROLL_DEADLINES.decimoTercero.day) },
    { what: "Utilidades (15 %), si hubo ganancia", due: nextYearly(today, PAYROLL_DEADLINES.utilidades.month, PAYROLL_DEADLINES.utilidades.day) },
  ].sort((a, b) => a.due.localeCompare(b.due));
  const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Trabajadores" subtitle="El equipo, sus roles de pago con IESS y beneficios de ley, y los coaches por honorarios. Solo lo ven dueños y contabilidad.">
        <EntityPills view={view} href={href} />
        <Link href="/dashboard/finanzas/trabajadores/roles" className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: PURPLE }}>
          <Plus className="size-4" /> Rol de pagos
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Equipo activo" value={String(people.length)} sub={`${dep} en dependencia · ${hon} por honorarios`} href="/dashboard/finanzas/trabajadores/equipo" icon={Users} color={PURPLE} />
        <Stat
          label={lastRun ? `Costo del rol de ${monthLabel(lastRun.period)}` : "Costo mensual"}
          value={fmtMoney(lastCost)}
          sub={lastRun ? "Sueldos + IESS patronal + beneficios" : "Todavía sin roles aprobados"}
          href={lastRun ? `/dashboard/finanzas/trabajadores/roles/${lastRun.id}` : "/dashboard/finanzas/trabajadores/roles"}
          icon={IdCard}
          color="#2f6fb0"
        />
        <Stat label={`Nómina ${year}`} value={fmtMoney(yearPayroll)} sub="Roles aprobados" href="/dashboard/finanzas/trabajadores/roles" icon={Banknote} color="#0f9f8f" />
        <Stat label={`Honorarios ${year}`} value={fmtMoney(yearFees)} sub="Coaches con factura" href="/dashboard/gastos?categoria=COACH_FEES&rango=anio" icon={Dumbbell} color="#d97e0a" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title={`Costo por persona · ${year}`} className="lg:col-span-2">
          <BarList rows={people$.slice(0, 15)} color={PURPLE} empty="Todavía no hay roles aprobados ni honorarios registrados este año." />
        </Panel>
        <Panel title="Próximas obligaciones">
          <ul className="space-y-2.5">
            {deadlines.map((d) => (
              <li key={d.what} className="flex items-center gap-3">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${daysTo(d.due) <= 7 ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                  <CalendarClock className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{d.what}</p>
                  <p className="text-xs text-muted-foreground">hasta el {d.due} · en {daysTo(d.due)} días</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">Fechas de ley para la Sierra. {sedes.map((s) => ENTITIES[s].name).join(" y ")}.</p>
        </Panel>
      </div>
    </div>
  );
}
