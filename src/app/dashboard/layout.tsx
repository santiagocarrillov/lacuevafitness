import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { DashboardShell } from "./dashboard-shell";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";
import { countMyDueTasks } from "@/lib/actions/staff-tasks";

type NavGroup = {
  label?: string;
  items: { href: string; label: string; show: boolean; badge?: number; match?: string[] }[];
};

const roleLabels: Record<string, string> = {
  OWNER: "Fundador",
  ACCOUNTING: "Contabilidad",
  ADMIN: "Administrador",
  COACH: "Coach",
  NUTRITIONIST: "Nutricionista",
  MEMBER: "Socio",
};

const sedeLabels: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireAuth();

  // Socios never belong in the staff dashboard — send them to their portal.
  // (Staff who are also athletes keep dashboard access; only pure MEMBERs bounce.)
  if (user.role === "MEMBER") redirect("/portal/hoy");

  // Menú agrupado en el orden del trabajo (Santiago, 3 oct 2026): quién es la
  // gente (Contactos) → cómo le hablamos (Marketing) → el día a día → el método
  // que vive el socio en su app (SRXFIT) → el dinero → los números → ajustes.
  const isOwner = user.role === "OWNER";
  const groups: NavGroup[] = [
    { items: [{ href: "/dashboard", label: "Resumen", show: true }] },
    {
      label: "Contactos",
      items: [
        { href: "/dashboard/leads", label: "Leads", show: can.manageLeads(user) },
        { href: "/dashboard/socios", label: "Socios", show: can.viewMembers(user) },
        { href: "/dashboard/segmentos", label: "Segmentos", show: can.viewSegments(user) },
      ],
    },
    {
      label: "Marketing",
      items: [
        { href: "/dashboard/comunicacion", label: "WhatsApp", show: can.manageLeads(user) },
        { href: "/dashboard/notificaciones", label: "Notificaciones", show: can.manageMembers(user) },
        { href: "/dashboard/reportes?tab=comercial", label: "Resultados comerciales", show: can.viewReports(user) },
      ],
    },
    {
      label: "Día a día",
      items: [
        { href: "/dashboard/tareas", label: "Tareas", show: true, badge: await countMyDueTasks() },
        { href: "/dashboard/asistencia", label: "Asistencia", show: true },
      ],
    },
    {
      // Todo lo que el socio ve en su app.
      label: "SRXFIT",
      items: [
        { href: "/dashboard/srxfit", label: "Panel SRXFIT", show: true },
        { href: "/dashboard/srxfit/calendario", label: "Programación", show: true },
        { href: "/dashboard/srxfit/evaluaciones", label: "Evaluaciones", show: can.editTests(user) || can.manageMembers(user) },
        { href: "/dashboard/nutricion", label: "Nutrición", show: can.scheduleNutrition(user) },
        {
          href: "/dashboard/retos",
          label: "Retos",
          show: can.manageChallenges(user) || user.role === "COACH" || user.role === "NUTRITIONIST",
        },
      ],
    },
    {
      label: "Finanzas",
      items: [
        { href: "/dashboard/pagos", label: "Pagos", show: can.viewPayments(user) },
        // Facturación, Gastos, Banco, Impuestos y Contabilidad son secciones de
        // Finanzas (barra propia). Admins solo registran gastos.
        {
          href: "/dashboard/finanzas",
          label: "Contabilidad y facturas",
          show: can.viewFinancials(user),
          match: ["/dashboard/facturas", "/dashboard/gastos", "/dashboard/contabilidad"],
        },
        { href: "/dashboard/gastos", label: "Gastos", show: can.viewPayments(user) && !can.viewFinancials(user) },
      ],
    },
    {
      label: "Reportes",
      items: [
        { href: "/dashboard/reportes", label: "Reportes", show: can.viewReports(user) },
        { href: "/dashboard/reportes/metas", label: "Metas", show: can.viewReports(user) },
      ],
    },
    {
      label: "Configuración",
      items: [
        { href: "/dashboard/usuarios", label: "Usuarios", show: can.manageUsers(user) },
        { href: "/dashboard/comunicacion/whatsapp-setup", label: "Número de WhatsApp", show: isOwner },
      ],
    },
  ];
  const nav = groups
    .map((g) => ({
      label: g.label,
      items: g.items.filter((i) => i.show).map(({ href, label, badge, match }) => ({ href, label, badge, match })),
    }))
    .filter((g) => g.items.length > 0);

  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  const userMeta = `${roleLabels[user.role] ?? user.role}${
    user.sede ? ` · ${sedeLabels[user.sede]}` : ""
  }`;

  // Every staff member can jump into the socio app to preview it — the portal
  // auto-provisions a lightweight preview member on first entry, so no member
  // record needs to exist beforehand. (MEMBERs were already redirected above.)

  return (
    <DashboardShell
      nav={nav}
      userName={user.fullName}
      userMeta={userMeta}
      showAthleteView={true}
      initialCollapsed={sidebarCollapsed}
    >
      {children}
    </DashboardShell>
  );
}
