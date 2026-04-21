import Link from "next/link";
import { ReactNode } from "react";
import { requireAuth, can } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

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

  const nav = [
    { href: "/dashboard", label: "Resumen", show: true },
    { href: "/dashboard/asistencia", label: "Asistencia", show: true },
    { href: "/dashboard/socios", label: "Socios", show: can.viewMembers(user) },
    { href: "/dashboard/leads", label: "Leads", show: can.manageLeads(user) },
    { href: "/dashboard/retos", label: "Retos", show: can.manageChallenges(user) || user.role === "COACH" },
    { href: "/dashboard/pagos", label: "Pagos", show: can.viewFinancials(user) },
    { href: "/dashboard/reportes", label: "Reportes", show: can.viewReports(user) },
    { href: "/dashboard/srxfit", label: "SRXFit", show: true },
    { href: "/dashboard/usuarios", label: "Usuarios", show: can.manageUsers(user) },
  ].filter((n) => n.show);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-60 border-r border-border flex flex-col bg-muted/30">
        <div className="px-6 py-5 border-b border-border">
          <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">La Cueva</p>
          <p className="text-sm font-semibold">Dashboard SRXFit</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md hover:bg-accent transition"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4 space-y-2">
          <div>
            <p className="text-sm font-medium truncate">{user.fullName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {roleLabels[user.role] ?? user.role}
              {user.sede && ` · ${sedeLabels[user.sede]}`}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
