import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartColumn, FileSpreadsheet, HandCoins, IdCard, Landmark, Receipt, Scale, type LucideIcon } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { PageHeader } from "../../page-header";
import { Soon } from "../../blocks";

export const dynamic = "force-dynamic";

type Report = { title: string; detail: string; href?: string };
type Family = { title: string; icon: LucideIcon; color: string; reports: Report[] };

// Report catalogue, grouped the way an accountant looks for them (like
// QuickBooks' Reports page). Each one opens its screen; every figure in it
// drills down to the ledger and the document.
const FAMILIES: Family[] = [
  {
    title: "Estados financieros",
    icon: Scale,
    color: "#3d3d3a",
    reports: [
      { title: "Estado de situación (balance general)", detail: "Activo, pasivo y patrimonio a la fecha, por empresa.", href: "/dashboard/contabilidad?tab=estados" },
      { title: "Estado de resultados (pérdidas y ganancias)", detail: "Del 1 de enero al cierre del mes, desde el libro diario.", href: "/dashboard/contabilidad?tab=estados" },
      { title: "Estados consolidados", detail: "Las dos empresas sumadas, cuenta por cuenta.", href: "/dashboard/contabilidad?tab=estados&entidad=CONSOLIDADO" },
      { title: "Balance de comprobación", detail: "Saldo inicial, débitos, créditos y saldo final de cada cuenta.", href: "/dashboard/contabilidad?tab=comprobacion" },
      { title: "Libro mayor", detail: "Movimientos de una cuenta con su documento de origen.", href: "/dashboard/contabilidad?tab=mayor" },
    ],
  },
  {
    title: "Ventas e ingresos",
    icon: HandCoins,
    color: "#0f9f8f",
    reports: [
      { title: "Resultados por sede", detail: "Ingresos, gastos y dinero de los dueños del mes, y los últimos 12 meses.", href: "/dashboard/finanzas/reportes/resultados" },
      { title: "Ventas por plan y forma de pago", detail: "Qué compran los socios y cómo pagan.", href: "/dashboard/finanzas/clientes" },
      { title: "Facturas emitidas", detail: "Facturas electrónicas del mes y su estado en el SRI.", href: "/dashboard/facturas" },
      { title: "Otros ingresos", detail: "Bebidas, suplementos y reembolsos.", href: "/dashboard/finanzas/otros-ingresos" },
    ],
  },
  {
    title: "Compras y gastos",
    icon: Receipt,
    color: "#d97e0a",
    reports: [
      { title: "Gastos por categoría", detail: "Todos los gastos del mes con filtros por empresa, categoría y documento.", href: "/dashboard/gastos" },
      { title: "Compras por proveedor", detail: "Cuánto se le compró a cada proveedor en el año.", href: "/dashboard/finanzas/proveedores" },
      { title: "Antigüedad de cuentas por pagar", detail: "Lo que se debe por proveedor: por vencer, 1–30, 31–60, 61–90 y más de 90 días.", href: "/dashboard/gastos?ver=porpagar" },
      { title: "Activos fijos y depreciación", detail: "Registro de activos y su depreciación mensual.", href: "/dashboard/contabilidad?tab=activos" },
    ],
  },
  {
    title: "Sueldos",
    icon: IdCard,
    color: "#6b4fb5",
    reports: [
      { title: "Costo del equipo", detail: "Nómina y honorarios del año, por persona.", href: "/dashboard/finanzas/trabajadores" },
      { title: "Roles de pago y planilla IESS", detail: "Rol de cada mes, recibos individuales y total a pagar al IESS.", href: "/dashboard/finanzas/trabajadores/roles" },
      { title: "Provisiones de beneficios sociales", detail: "Décimos y vacaciones por pagar: saldos de las cuentas 2.1.10 a 2.1.12.", href: "/dashboard/contabilidad?tab=comprobacion" },
    ],
  },
  {
    title: "Impuestos",
    icon: Landmark,
    color: "#e5533f",
    reports: [
      { title: "Formulario 104 (IVA)", detail: "Borrador mensual por empresa, con el crédito tributario arrastrado.", href: "/dashboard/finanzas/impuestos" },
      { title: "Anexo transaccional (ATS)", detail: "XML de Xtreme validado contra el esquema del SRI.", href: "/dashboard/finanzas/impuestos" },
      { title: "Retenciones en la fuente", detail: "Para las empresas que son agentes de retención." },
      { title: "Impuesto a la renta anual", detail: "Conciliación tributaria y formulario 101/102." },
    ],
  },
  {
    title: "Caja y bancos",
    icon: FileSpreadsheet,
    color: "#3a8fd1",
    reports: [
      { title: "Conciliación bancaria", detail: "Movimientos del extracto por clasificar y ya clasificados.", href: "/dashboard/finanzas/banco" },
      { title: "Dueños y accionistas", detail: "Aportes, préstamos y retiros acumulados por persona.", href: "/dashboard/finanzas/aportes" },
    ],
  },
];

export default async function ReportesPage() {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) redirect("/dashboard?forbidden=1");
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title="Reportes" subtitle="Todo sale del libro diario o de los documentos que lo alimentan; cada cifra lleva a su detalle." />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {FAMILIES.map((f) => {
          const Icon = f.icon;
          return (
            <section key={f.title} className="rounded-xl border border-stone-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: f.color }}>
                  <Icon className="size-4" />
                </span>
                <h2 className="font-semibold">{f.title}</h2>
              </div>
              <ul className="divide-y">
                {f.reports.map((r) => (
                  <li key={r.title}>
                    {r.href ? (
                      <Link href={r.href} className="group flex items-start gap-2 py-2.5">
                        <ChartColumn className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                        <span>
                          <span className="block text-sm font-medium text-[#2f6fb0] group-hover:underline">{r.title}</span>
                          <span className="block text-xs text-muted-foreground">{r.detail}</span>
                        </span>
                      </Link>
                    ) : (
                      <div className="flex items-start gap-2 py-2.5 opacity-70">
                        <ChartColumn className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="flex items-center gap-2 text-sm font-medium">{r.title} <Soon>Próximamente</Soon></span>
                          <span className="block text-xs text-muted-foreground">{r.detail}</span>
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
