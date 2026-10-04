import Link from "next/link";
import { redirect } from "next/navigation";
import { Banknote, CalendarClock, Dumbbell, IdCard } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENTITIES, ENTITY_ORDER, fmtMoney } from "@/lib/finance/entities";
import { parseEntityView, type EntityView } from "@/lib/finance/home";
import { ecuadorDateString } from "@/lib/timezone";
import { EntityPills, PageHeader } from "../../page-header";
import { BarList, Panel, Soon, Stat } from "../../blocks";

export const dynamic = "force-dynamic";

const PURPLE = "#6b4fb5";

// What the payroll module will compute, by Ecuadorian law. Shown so the plan
// is visible (and so another gym sees what it covers) until it is built.
const PAYROLL_PIECES: { title: string; detail: string }[] = [
  { title: "Rol de pagos mensual", detail: "Sueldo, horas extra, bonos, anticipos y descuentos; recibo para cada trabajador." },
  { title: "IESS", detail: "Aporte personal 9,45 % y patronal 12,15 % (incluye IECE y SECAP); planilla mensual." },
  { title: "Fondos de reserva", detail: "8,33 % desde el segundo año: al IESS o mensualizado en el rol." },
  { title: "Décimo tercero y décimo cuarto", detail: "Provisión mensual; pago acumulado (diciembre / agosto en la Sierra) o mensualizado." },
  { title: "Vacaciones y liquidaciones", detail: "15 días al año; finiquito al salir (proporcionales y desahucio)." },
  { title: "Utilidades (15 %)", detail: "Reparto anual hasta abril para las empresas con trabajadores en relación de dependencia." },
  { title: "Impuesto a la renta del trabajador", detail: "Retención mensual proyectada y formulario 107 al cierre del año." },
  { title: "Coaches por honorarios", detail: "Factura o liquidación de compra del coach, con su retención cuando aplica." },
];

export default async function TrabajadoresPage({ searchParams }: { searchParams: Promise<{ anio?: string; entidad?: string }> }) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const thisYear = Number(ecuadorDateString().slice(0, 4));
  const year = /^\d{4}$/.test(params.anio ?? "") && Number(params.anio) <= thisYear ? Number(params.anio) : thisYear;
  const view = parseEntityView(params.entidad);
  const sedes = view === "ALL" ? ENTITY_ORDER : [view];
  const href = (u: { anio?: number; entidad?: EntityView }) => {
    const q = new URLSearchParams({ anio: String(u.anio ?? year) });
    const e = u.entidad ?? view;
    if (e !== "ALL") q.set("entidad", e);
    return `/dashboard/finanzas/trabajadores?${q}`;
  };

  // Until payroll exists, what the team costs is what was recorded as
  // expenses in the private accounts (sueldos 5.2.01, coaches 5.2.02).
  const rows = await prisma.expense.findMany({
    where: {
      sede: { in: sedes },
      voidedAt: null,
      category: { in: ["PAYROLL", "COACH_FEES"] },
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    select: { id: true, sede: true, category: true, amountCents: true, supplierName: true, description: true, date: true },
    orderBy: { date: "desc" },
  });
  const payroll = rows.filter((r) => r.category === "PAYROLL");
  const coaches = rows.filter((r) => r.category === "COACH_FEES");
  const sum = (xs: typeof rows) => xs.reduce((a, r) => a + r.amountCents, 0);
  const byPerson = new Map<string, number>();
  for (const r of rows) {
    const who = r.supplierName || r.description;
    byPerson.set(who, (byPerson.get(who) ?? 0) + r.amountCents);
  }
  const people = [...byPerson].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Trabajadores" subtitle="Lo que cuesta el equipo: sueldos con IESS y beneficios de ley, y coaches por honorarios. Solo lo ven dueños y contabilidad.">
        <EntityPills view={view} href={(v) => href({ entidad: v })} />
        <nav className="flex items-center gap-1 text-sm" aria-label="Año">
          {[thisYear - 1, thisYear].map((y) => (
            <Link key={y} href={href({ anio: y })} className={`rounded-md border px-2.5 py-1 ${y === year ? "border-foreground font-medium" : "text-muted-foreground hover:bg-muted"}`}>
              {y}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Costo del equipo ${year}`} value={fmtMoney(sum(rows))} sub={`${rows.length} pagos registrados`} icon={Banknote} color={PURPLE} />
        <Stat label="Sueldos y beneficios" value={fmtMoney(sum(payroll))} sub="Relación de dependencia" href={`/dashboard/gastos?categoria=PAYROLL&mes=${year === thisYear ? ecuadorDateString().slice(0, 7) : `${year}-12`}`} icon={IdCard} color="#2f6fb0" />
        <Stat label="Honorarios de coaches" value={fmtMoney(sum(coaches))} sub="Servicios profesionales" href={`/dashboard/gastos?categoria=COACH_FEES&mes=${year === thisYear ? ecuadorDateString().slice(0, 7) : `${year}-12`}`} icon={Dumbbell} color="#0f9f8f" />
        <Stat label="Personas pagadas" value={String(people.length)} sub="Según los gastos registrados" icon={CalendarClock} color="#d97e0a" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title={`Pagado por persona · ${year}`} className="lg:col-span-1">
          <BarList rows={people.slice(0, 12)} color={PURPLE} empty="Todavía no hay sueldos ni honorarios registrados este año." />
        </Panel>
        <Panel title="Nómina" aside={<Soon>Próximamente</Soon>} className="lg:col-span-2">
          <p className="mb-4 text-sm text-muted-foreground">
            El módulo de roles de pago calculará todo lo que pide la ley ecuatoriana y generará solo el asiento contable y la
            planilla. Para empezar necesita los datos del personal que lleva Isabel (contratos, sueldos y fechas de ingreso).
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PAYROLL_PIECES.map((p) => (
              <li key={p.title} className="rounded-lg border border-stone-200 p-3">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.detail}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {rows.length > 0 && (
        <Panel title="Últimos pagos al personal">
          <table className="w-full text-sm">
            <tbody>
              {rows.slice(0, 12).map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-stone-50">
                  <td className="py-2 pr-3 tabular-nums text-muted-foreground">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/dashboard/gastos/${r.id}`} className="hover:underline">{r.supplierName || r.description}</Link>
                  </td>
                  <td className="hidden py-2 pr-3 text-muted-foreground sm:table-cell">{r.category === "PAYROLL" ? "Sueldo" : "Honorarios"} · {ENTITIES[r.sede].name.replace("La Cueva ", "")}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtMoney(r.amountCents, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
