import Link from "next/link";
import { ReactNode } from "react";

const nav = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/dashboard/asistencia", label: "Asistencia" },
  { href: "/dashboard/socios", label: "Socios" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/pagos", label: "Pagos" },
  { href: "/dashboard/reportes", label: "Reportes" },
  { href: "/dashboard/srxfit", label: "SRXFit" },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-50">
      <aside className="w-60 border-r border-zinc-800 flex flex-col">
        <div className="px-6 py-5 border-b border-zinc-800">
          <p className="text-xs tracking-[0.3em] text-zinc-400 uppercase">La Cueva</p>
          <p className="text-sm font-semibold">Dashboard SRXFit</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md hover:bg-zinc-800 transition"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 text-xs text-zinc-500 border-t border-zinc-800">v0.1</div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
