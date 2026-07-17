"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

type NavItem = { href: string; label: string };

type Props = {
  children: ReactNode;
  nav: NavItem[];
  userName: string;
  userMeta: string;
  showAthleteView?: boolean;
};

export function DashboardShell({ children, nav, userName, userMeta, showAthleteView }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close drawer when navigating
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 h-12 border-b border-border bg-background/95 backdrop-blur flex items-center justify-between px-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="p-2 -ml-2 rounded-md hover:bg-accent transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <p className="font-heading text-base font-semibold uppercase tracking-wide">La Cueva</p>
        <div className="w-8" />
      </header>

      {/* Backdrop (mobile only, when drawer open) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 w-60 border-r border-border bg-background md:bg-muted/30 flex flex-col
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">La Cueva</p>
            <p className="font-heading text-base font-semibold uppercase tracking-wide">Dashboard SRXFit</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="md:hidden p-1 -mr-1 rounded-md hover:bg-accent transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm overflow-y-auto">
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
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userMeta}</p>
          </div>
          {showAthleteView && (
            <Link
              href="/portal/hoy"
              className="block text-xs font-medium text-foreground hover:underline"
            >
              Ver mi app de socio →
            </Link>
          )}
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

      <main className="flex-1 overflow-auto pt-12 md:pt-0">{children}</main>
    </div>
  );
}
