// The accounting app is organised like QuickBooks for services, adapted to
// Ecuador (Santiago, 4 oct 2026): Clientes · Proveedores · Trabajadores ·
// Caja y Bancos · Empresa · Reportes, with a process-flow home. Every screen
// that already existed keeps its URL; this file only says where it belongs.

import {
  ArrowLeftRight,
  BookOpen,
  BookPlus,
  Building2,
  ChartColumn,
  ChartPie,
  FileInput,
  FileText,
  HandCoins,
  IdCard,
  Landmark,
  LayoutDashboard,
  ListChecks,
  ListTree,
  Package,
  PiggyBank,
  Receipt,
  Scale,
  ShoppingCart,
  Truck,
  Upload,
  Users,
  WalletCards,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export type Loc = { path: string; params: URLSearchParams };

export type SubItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** True when this item is the page being shown. */
  active: (l: Loc) => boolean;
};

export type FinanceModule = {
  key: string;
  label: string;
  /** One line under the label on the home page. */
  blurb: string;
  icon: LucideIcon;
  /** Brand palette (SRXFIT zones), used for the icon disc and the charts. */
  color: string;
  href: string;
  subs: SubItem[];
};

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
const contabTab = (l: Loc) => l.params.get("tab") ?? "estados";
const isContab = (l: Loc, tabs: string[]) => under(l.path, "/dashboard/contabilidad") && tabs.includes(contabTab(l));

export const FINANCE_MODULES: FinanceModule[] = [
  {
    key: "inicio",
    label: "Inicio",
    blurb: "Cómo va el mes y qué falta por hacer",
    icon: LayoutDashboard,
    color: "#1d1d1b",
    href: "/dashboard/finanzas",
    subs: [],
  },
  {
    key: "clientes",
    label: "Clientes",
    blurb: "Socios, cobros y facturas",
    icon: HandCoins,
    color: "#0f9f8f",
    href: "/dashboard/finanzas/clientes",
    subs: [
      { label: "Resumen", href: "/dashboard/finanzas/clientes", icon: ChartPie, active: (l) => under(l.path, "/dashboard/finanzas/clientes") },
      { label: "Cobros de socios", href: "/dashboard/pagos", icon: WalletCards, active: (l) => under(l.path, "/dashboard/pagos") },
      {
        label: "Facturas",
        href: "/dashboard/facturas",
        icon: FileText,
        active: (l) => under(l.path, "/dashboard/facturas") && l.params.get("tab") !== "config" && !l.path.includes("/catalogo") && !l.path.includes("/puntos"),
      },
      { label: "Pagadores", href: "/dashboard/finanzas/pagadores", icon: Users, active: (l) => under(l.path, "/dashboard/finanzas/pagadores") },
      { label: "Otros ingresos", href: "/dashboard/finanzas/otros-ingresos", icon: ShoppingCart, active: (l) => under(l.path, "/dashboard/finanzas/otros-ingresos") },
      {
        label: "Servicios y emisión SRI",
        href: "/dashboard/facturas?tab=config",
        icon: Package,
        active: (l) => under(l.path, "/dashboard/facturas") && (l.params.get("tab") === "config" || l.path.includes("/catalogo") || l.path.includes("/puntos")),
      },
    ],
  },
  {
    key: "proveedores",
    label: "Proveedores",
    blurb: "Gastos y cuentas por pagar",
    icon: Truck,
    color: "#d97e0a",
    href: "/dashboard/finanzas/proveedores",
    subs: [
      { label: "Proveedores", href: "/dashboard/finanzas/proveedores", icon: Truck, active: (l) => under(l.path, "/dashboard/finanzas/proveedores") },
      {
        label: "Gastos",
        href: "/dashboard/gastos",
        icon: Receipt,
        active: (l) => under(l.path, "/dashboard/gastos") && !l.path.includes("importar-sri") && !["porpagar", "revisar"].includes(l.params.get("ver") ?? ""),
      },
      { label: "Por pagar", href: "/dashboard/gastos?ver=porpagar", icon: HandCoins, active: (l) => l.path === "/dashboard/gastos" && l.params.get("ver") === "porpagar" },
      { label: "Por revisar", href: "/dashboard/gastos?ver=revisar", icon: Scale, active: (l) => l.path === "/dashboard/gastos" && l.params.get("ver") === "revisar" },
      { label: "Importar del SRI", href: "/dashboard/gastos/importar-sri", icon: FileInput, active: (l) => l.path === "/dashboard/gastos/importar-sri" },
    ],
  },
  {
    key: "trabajadores",
    label: "Trabajadores",
    blurb: "Roles de pago, IESS y retenciones",
    icon: IdCard,
    color: "#6b4fb5",
    href: "/dashboard/finanzas/trabajadores",
    subs: [
      { label: "Resumen", href: "/dashboard/finanzas/trabajadores", icon: ChartPie, active: (l) => l.path === "/dashboard/finanzas/trabajadores" },
      { label: "Equipo", href: "/dashboard/finanzas/trabajadores/equipo", icon: Users, active: (l) => under(l.path, "/dashboard/finanzas/trabajadores/equipo") },
      { label: "Roles de pago", href: "/dashboard/finanzas/trabajadores/roles", icon: FileText, active: (l) => under(l.path, "/dashboard/finanzas/trabajadores/roles") },
    ],
  },
  {
    key: "banco",
    label: "Caja y Bancos",
    blurb: "Cuentas, extractos y conciliación",
    icon: Landmark,
    color: "#3a8fd1",
    href: "/dashboard/finanzas/banco",
    subs: [
      { label: "Resumen", href: "/dashboard/finanzas/banco", icon: ChartPie, active: (l) => l.path === "/dashboard/finanzas/banco" },
      { label: "Conciliar", href: "/dashboard/finanzas/banco/conciliar", icon: ListChecks, active: (l) => under(l.path, "/dashboard/finanzas/banco/conciliar") },
      { label: "Movimientos", href: "/dashboard/finanzas/banco/movimientos", icon: ArrowLeftRight, active: (l) => under(l.path, "/dashboard/finanzas/banco/movimientos") },
      { label: "Subir extracto", href: "/dashboard/finanzas/banco/importar", icon: Upload, active: (l) => under(l.path, "/dashboard/finanzas/banco/importar") },
      { label: "Reglas", href: "/dashboard/finanzas/banco/reglas", icon: Wand2, active: (l) => under(l.path, "/dashboard/finanzas/banco/reglas") },
      {
        label: "Cuentas",
        href: "/dashboard/finanzas/banco/cuentas",
        icon: Landmark,
        active: (l) => under(l.path, "/dashboard/finanzas/banco/cuentas") || under(l.path, "/dashboard/finanzas/banco/nueva-cuenta"),
      },
    ],
  },
  {
    key: "empresa",
    label: "Empresa",
    blurb: "Plan de cuentas, asientos y dueños",
    icon: Building2,
    color: "#3d3d3a",
    href: "/dashboard/finanzas/empresa",
    subs: [
      { label: "Datos de la empresa", href: "/dashboard/finanzas/empresa", icon: Building2, active: (l) => under(l.path, "/dashboard/finanzas/empresa") },
      { label: "Libro diario", href: "/dashboard/contabilidad?tab=diario", icon: BookOpen, active: (l) => isContab(l, ["diario"]) },
      { label: "Nuevo asiento", href: "/dashboard/contabilidad?tab=nuevo", icon: BookPlus, active: (l) => isContab(l, ["nuevo"]) },
      { label: "Mayor", href: "/dashboard/contabilidad?tab=mayor", icon: ListTree, active: (l) => isContab(l, ["mayor"]) },
      { label: "Plan de cuentas", href: "/dashboard/contabilidad?tab=plan", icon: ListTree, active: (l) => isContab(l, ["plan"]) },
      {
        label: "Activos fijos",
        href: "/dashboard/contabilidad?tab=activos",
        icon: Package,
        active: (l) => isContab(l, ["activos"]) || under(l.path, "/dashboard/contabilidad/activos"),
      },
      { label: "Dueños y accionistas", href: "/dashboard/finanzas/aportes", icon: PiggyBank, active: (l) => under(l.path, "/dashboard/finanzas/aportes") },
    ],
  },
  {
    key: "reportes",
    label: "Reportes",
    blurb: "Estados financieros, ventas, gastos e impuestos",
    icon: ChartColumn,
    color: "#e5533f",
    href: "/dashboard/finanzas/reportes",
    subs: [
      { label: "Todos los reportes", href: "/dashboard/finanzas/reportes", icon: ChartColumn, active: (l) => l.path === "/dashboard/finanzas/reportes" },
      {
        label: "Estados financieros",
        href: "/dashboard/contabilidad?tab=estados",
        icon: Scale,
        active: (l) => isContab(l, ["estados"]) && !l.path.includes("/activos"),
      },
      { label: "Comprobación", href: "/dashboard/contabilidad?tab=comprobacion", icon: Scale, active: (l) => isContab(l, ["comprobacion"]) },
      { label: "Resultados por sede", href: "/dashboard/finanzas/reportes/resultados", icon: ChartPie, active: (l) => under(l.path, "/dashboard/finanzas/reportes/resultados") },
      { label: "Impuestos", href: "/dashboard/finanzas/impuestos", icon: Landmark, active: (l) => under(l.path, "/dashboard/finanzas/impuestos") },
    ],
  },
];

/** Module the current page belongs to (null outside the accounting app). */
export function activeModule(l: Loc): FinanceModule | null {
  if (l.path === "/dashboard/finanzas") return FINANCE_MODULES[0];
  for (const m of FINANCE_MODULES) {
    if (m.subs.some((s) => s.active(l))) return m;
    if (m.key !== "inicio" && under(l.path, m.href)) return m;
  }
  // Pages without their own sub-item (detail screens) fall under their family.
  if (under(l.path, "/dashboard/contabilidad")) return FINANCE_MODULES.find((m) => m.key === "empresa")!;
  return null;
}
