"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { StaffPushToggle } from "./staff-push-toggle";
import { BackButton, useTrackNavigation } from "./back-button";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";

type NavItem = { href: string; label: string; badge?: number; match?: string[] };
type NavGroup = { label?: string; items: NavItem[] };

type Props = {
  children: ReactNode;
  nav: NavGroup[];
  userName: string;
  userMeta: string;
  showAthleteView?: boolean;
  initialCollapsed?: boolean;
};

export function DashboardShell({ children, nav: groups, userName, userMeta, showAthleteView, initialCollapsed = false }: Props) {
  const [open, setOpen] = useState(false);
  // Desktop only: hide the whole menu with one click to give the page the full width.
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();
  useTrackNavigation();
  const nav = groups.flatMap((g) => g.items);
  const groupOf = (href?: string) => groups.find((g) => g.items.some((i) => i.href === href))?.label;

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }

  // "[" toggles the menu on desktop, like Linear/Notion (ignored while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      toggleCollapsed();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Highlight the section the user is in (longest matching prefix wins).
  const prefixes = (i: NavItem) => [i.href, ...(i.match ?? [])];
  const score = (i: NavItem) =>
    Math.max(-1, ...prefixes(i).filter((p) => (p === "/dashboard" ? pathname === p : pathname === p || pathname.startsWith(`${p}/`))).map((p) => p.length));
  const best = Math.max(...nav.map(score));
  const activeHref = best >= 0 ? nav.find((i) => score(i) === best)?.href : undefined;
  const current = nav.find((i) => i.href === activeHref);

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
        {pathname === "/dashboard" ? (
          <p className="font-heading text-base font-semibold uppercase tracking-wide">La Cueva</p>
        ) : (
          <p className="truncate text-sm font-medium">{current?.label ?? "La Cueva"}</p>
        )}
        <BackButton className="-mr-1" />
        {pathname === "/dashboard" && <div className="w-8" />}
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
          fixed md:sticky md:top-0 md:h-screen inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-border bg-background md:bg-muted/30 flex flex-col
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 ${collapsed ? "md:hidden" : ""}
        `}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">La Cueva</p>
            <p className="font-heading text-base font-semibold uppercase tracking-wide">Dashboard SRXFit</p>
          </div>
          <button
            onClick={toggleCollapsed}
            aria-label="Esconder menú"
            title="Esconder menú ( [ )"
            className="hidden md:inline-flex p-1 -mr-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <PanelLeftClose className="size-4" />
          </button>
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
        <nav className="flex-1 px-3 py-3 text-sm overflow-y-auto">
          {groups.map((group, gi) => (
            <div key={group.label ?? gi} className={gi > 0 ? "mt-4" : ""}>
              {group.label && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={item.href === activeHref ? "page" : undefined}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-md transition ${
                      item.href === activeHref ? "bg-accent font-medium text-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {item.label}
                    {item.badge ? (
                      <span
                        className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-medium leading-5 text-white"
                        title="Tareas tuyas o de tu recepción para hoy o vencidas"
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
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
          <StaffPushToggle />
          <Link
            href={
              pathname.startsWith("/dashboard/cuenta/")
                ? "/dashboard/cuenta/contrasena"
                : `/dashboard/cuenta/contrasena?volver=${encodeURIComponent(pathname)}`
            }
            className="block w-full text-left text-xs text-muted-foreground hover:text-foreground transition"
          >
            Cambiar contraseña
          </Link>
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

      <main className="min-w-0 flex-1 pt-12 md:pt-0">
        {/* Desktop top bar: show/hide the menu, Back, and where you are. */}
        <div className="sticky top-0 z-30 hidden h-11 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur md:flex md:px-6">
          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Mostrar menú"
              title="Mostrar menú ( [ )"
              className="-ml-2 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <BackButton />
          <span className="text-sm text-muted-foreground">
            {pathname === "/dashboard" || !current
              ? ""
              : groupOf(current.href) && groupOf(current.href) !== current.label
                ? `${groupOf(current.href)} › ${current.label}`
                : current.label}
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
