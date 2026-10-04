import Link from "next/link";
import {
  Banknote,
  BookPlus,
  FileInput,
  FileSpreadsheet,
  FileText,
  HandCoins,
  IdCard,
  Landmark,
  ListTree,
  Lock,
  Package,
  Receipt,
  Scale,
  ShoppingCart,
  Upload,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { fmtMoney } from "@/lib/finance/entities";
import type { HomeData } from "@/lib/finance/home";

type Node = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Red counter, like QuickBooks' "Record deposits ③". */
  badge?: number;
  hint?: string;
  soon?: boolean;
};

const TEAL = "#0f9f8f";
const ORANGE = "#d97e0a";
const PURPLE = "#6b4fb5";
const BLUE = "#3a8fd1";
const GRAPHITE = "#3d3d3a";

function Tile({ n, color }: { n: Node; color: string }) {
  const Icon = n.icon;
  return (
    <Link
      href={n.href}
      className={`group relative flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 rounded-lg p-1.5 text-center transition hover:bg-stone-50 ${n.soon ? "opacity-55" : ""}`}
      title={n.hint}
    >
      <span
        className="relative flex size-11 items-center justify-center rounded-xl border transition group-hover:-translate-y-0.5 group-hover:shadow-md"
        style={{ backgroundColor: `${color}12`, borderColor: `${color}40`, color }}
      >
        <Icon className="size-5" strokeWidth={2} />
        {!!n.badge && (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
            {n.badge > 99 ? "99+" : n.badge}
          </span>
        )}
      </span>
      <span className="text-[11px] leading-tight text-foreground/80 group-hover:text-foreground">{n.label}</span>
      {n.soon && <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Próximamente</span>}
    </Link>
  );
}

/** Line + arrowhead that stretches between two steps, like QuickBooks' home. */
function Connector() {
  return (
    <div className="relative mt-7 h-px min-w-5 flex-1 bg-stone-300">
      <span className="absolute -right-px -top-[3.5px] size-2 rotate-45 border-r border-t border-stone-400" />
    </div>
  );
}

function Lane({ title, color, nodes, end }: { title: string; color: string; nodes: Node[]; end?: string }) {
  return (
    <div className="relative rounded-xl border border-stone-200 bg-white px-3 pb-3 pt-5">
      <span
        className="absolute -top-2.5 left-3 rounded-md border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color, borderColor: `${color}55` }}
      >
        {title}
      </span>
      <div className="flex items-start overflow-x-auto [scrollbar-width:none]">
        {nodes.map((n, i) => (
          <div key={n.label} className={`flex items-start ${i > 0 ? "flex-1" : ""}`}>
            {i > 0 && <Connector />}
            <Tile n={n} color={color} />
          </div>
        ))}
        {end && (
          <div className="flex flex-1 items-start">
            <Connector />
            <span className="mt-[1.05rem] shrink-0 rounded-md bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-600">{end}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ title, color, nodes }: { title: string; color: string; nodes: Node[] }) {
  return (
    <div className="relative rounded-xl border border-stone-200 bg-white px-2 pb-2 pt-5">
      <span
        className="absolute -top-2.5 left-3 rounded-md border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color, borderColor: `${color}55` }}
      >
        {title}
      </span>
      <div className="grid grid-cols-3 gap-y-1 justify-items-center">
        {nodes.map((n) => (
          <Tile key={n.label} n={n} color={color} />
        ))}
      </div>
    </div>
  );
}

/** QuickBooks-Desktop-style home: the work as a flow, each step a door with its pending count. */
export function ProcessFlow({ data, ym, today }: { data: HomeData; ym: string; today: string }) {
  const t = data.todo;
  const prevMonthEnd = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  prevMonthEnd.setUTCDate(0);
  const unclosed = t.openMonths.filter((o) => !o.lockedThrough || o.lockedThrough < prevMonthEnd.toISOString().slice(0, 10)).length;

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-5">
        <Lane
          title="Clientes · socios"
          color={TEAL}
          end="Caja y Bancos"
          nodes={[
            { label: "Planes y servicios", href: "/dashboard/facturas?tab=config", icon: Package },
            { label: "Cobrar al socio", href: "/dashboard/pagos", icon: WalletCards },
            {
              label: "Facturar al SRI",
              href: `/dashboard/facturas?mes=${ym}`,
              icon: FileText,
              badge: t.uninvoicedPayments + t.invoicesToFix,
              hint: `${t.uninvoicedPayments} cobros sin factura · ${t.invoicesToFix} facturas por enviar o corregir`,
            },
            { label: "Otros ingresos", href: `/dashboard/finanzas/otros-ingresos?mes=${ym}`, icon: ShoppingCart },
            {
              label: "Cuadrar con el banco",
              href: "/dashboard/pagos",
              icon: Scale,
              hint: t.unreconciledCents ? `${fmtMoney(t.unreconciledCents)} cobrados por recepción sin cuadrar con el banco` : undefined,
            },
          ]}
        />
        <Lane
          title="Proveedores · gastos"
          color={ORANGE}
          end="Caja y Bancos"
          nodes={[
            { label: "Facturas del SRI (XML)", href: "/dashboard/gastos/importar-sri", icon: FileInput },
            { label: "Registrar gasto", href: "/dashboard/gastos/nuevo", icon: Receipt },
            { label: "Revisar", href: "/dashboard/gastos?ver=revisar", icon: Scale, badge: t.expensesToReview, hint: "Gastos que registraron los admins" },
            {
              label: "Pagar",
              href: "/dashboard/gastos?ver=porpagar",
              icon: HandCoins,
              badge: t.payablesCount,
              hint: t.payablesCount ? `${fmtMoney(t.payablesCents)} por pagar${t.overduePayables ? ` · ${t.overduePayables} vencidas` : ""}` : undefined,
            },
          ]}
        />
        <Lane
          title="Trabajadores · nómina"
          color={PURPLE}
          end="Impuestos"
          nodes={[
            { label: "Equipo y contratos", href: "/dashboard/finanzas/trabajadores/equipo", icon: IdCard },
            { label: "Rol de pagos", href: "/dashboard/finanzas/trabajadores/roles", icon: FileSpreadsheet },
            { label: "Pagar sueldos", href: "/dashboard/finanzas/trabajadores/roles", icon: Banknote },
            { label: "IESS y décimos", href: "/dashboard/finanzas/trabajadores", icon: HandCoins },
          ]}
        />
      </div>
      <div className="min-w-0 space-y-5">
        <Panel
          title="Caja y Bancos"
          color={BLUE}
          nodes={[
            { label: "Importar extracto", href: "/dashboard/finanzas/banco", icon: Upload },
            { label: "Conciliar", href: "/dashboard/finanzas/banco", icon: Landmark, badge: t.bankPending, hint: "Movimientos del banco por clasificar" },
            { label: "Dueños", href: `/dashboard/finanzas/aportes?mes=${ym}`, icon: Banknote },
          ]}
        />
        <Panel
          title="Empresa"
          color={GRAPHITE}
          nodes={[
            { label: "Plan de cuentas", href: "/dashboard/contabilidad?tab=plan", icon: ListTree },
            { label: "Asiento manual", href: "/dashboard/contabilidad?tab=nuevo", icon: BookPlus },
            { label: "Cerrar mes", href: "/dashboard/contabilidad?tab=diario", icon: Lock, badge: unclosed, hint: unclosed ? "El mes pasado sigue abierto" : undefined },
          ]}
        />
        <Panel
          title="Impuestos"
          color="#e5533f"
          nodes={[
            { label: "IVA (104)", href: "/dashboard/finanzas/impuestos", icon: Landmark },
            { label: "ATS", href: "/dashboard/finanzas/impuestos", icon: FileSpreadsheet },
            { label: "Retenciones", href: "/dashboard/finanzas/impuestos", icon: Receipt, soon: true },
          ]}
        />
      </div>
    </section>
  );
}
