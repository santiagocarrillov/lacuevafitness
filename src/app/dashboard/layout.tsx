import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
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

  // Socios never belong in the staff dashboard — send them to their portal.
  // (Staff who are also athletes keep dashboard access; only pure MEMBERs bounce.)
  if (user.role === "MEMBER") redirect("/portal/hoy");

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

  // Every staff member can jump into the socio app to preview it — the portal
  // auto-provisions a lightweight preview member on first entry, so no member
  // record needs to exist beforehand. (MEMBERs were already redirected above.)

  return (
    <DashboardShell
      nav={nav}
      userName={user.fullName}
      userMeta={userMeta}
      showAthleteView={true}
    >
      {children}
    </DashboardShell>
  );
}
