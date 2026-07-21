import { ReactNode } from "react";
import { requireAuth, can, resolveAthleteMember } from "@/lib/auth";
import { DashboardShell } from "./dashboard-shell";

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

  // Retos, Nutrición y Notificaciones viven ahora dentro del hub de SRXFit.
  const nav = [
    { href: "/dashboard", label: "Resumen", show: true },
    { href: "/dashboard/asistencia", label: "Asistencia", show: true },
    { href: "/dashboard/socios", label: "Socios", show: can.viewMembers(user) },
    { href: "/dashboard/pagos", label: "Pagos", show: can.viewPayments(user) },
    { href: "/dashboard/srxfit", label: "SRXFit", show: true },
    { href: "/dashboard/comunicacion", label: "Comunicación", show: can.manageLeads(user) },
    { href: "/dashboard/leads", label: "Leads", show: can.manageLeads(user) },
    { href: "/dashboard/segmentos", label: "Segmentos", show: can.viewSegments(user) },
    { href: "/dashboard/reportes", label: "Reportes", show: can.viewReports(user) },
    { href: "/dashboard/usuarios", label: "Usuarios", show: can.manageUsers(user) },
  ].filter((n) => n.show).map(({ href, label }) => ({ href, label }));

  const userMeta = `${roleLabels[user.role] ?? user.role}${
    user.sede ? ` · ${sedeLabels[user.sede]}` : ""
  }`;

  // Staff who are also athletes (a Member matches them) can jump to their own
  // member view. Read-only resolve here; the link is shown only when one exists.
  const athlete = user.role !== "MEMBER" ? await resolveAthleteMember(user) : null;

  return (
    <DashboardShell
      nav={nav}
      userName={user.fullName}
      userMeta={userMeta}
      showAthleteView={athlete != null}
    >
      {children}
    </DashboardShell>
  );
}
