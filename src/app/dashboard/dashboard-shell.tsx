"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  ChevronDown,
  Dumbbell,
  Home,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { StaffPushToggle } from "./staff-push-toggle";
import { BackButton, useTrackNavigation } from "./back-button";
import { SIDEBAR_COOKIE } from "./sidebar-cookie";

type NavItem = { href: string; label: string; badge?: number; match?: string[] };
type NavGroup = { label?: string; items: NavItem[] };

const GROUP_ICON: Record<string, LucideIcon> = {
  Contactos: Users,
  Marketing: Megaphone,
  "Día a día": CalendarCheck,
  SRXFIT: Dumbbell,
  Finanzas: Wallet,
  Reportes: BarChart3,
  "Configuración": Settings,
};

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
  // Everything waiting in the menu (tareas + por validar…), shown on the button
  // that opens it so a closed menu still says there's something to do.
  const pendingTotal = nav.reduce((n, i) => n + (i.badge ?? 0), 0);
  const pendingDot = pendingTotal > 0 && (
    <span
      aria-hidden
      className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-white ring-2 ring-background"
    >
      {pendingTotal > 99 ? "99+" : pendingTotal}
    </span>
  );
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
  // Groups fold like HubSpot's menu: click the title to open/close. The group of
  // the page you're on is always open.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const activeGroup = groupOf(activeHref);
  const toggleGroup = (label: string) =>
    setOpenGroups((s) => {
      const n = new Set(s);
      if (n.has(label)) n.delete(label);
      else n.add(label);
      return n;
    });

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
          aria-label={pendingTotal > 0 ? `Abrir menú (${pendingTotal} pendientes)` : "Abrir menú"}
          className="relative p-2 -ml-2 rounded-md hover:bg-accent transition"
        >
          {pendingDot}
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
          fixed md:sticky md:top-0 md:h-screen inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 ${collapsed ? "md:hidden" : ""}
        `}
      >
        <div className="px-5 py-5 border-b border-sidebar-border flex items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.3em] text-sidebar-foreground/55 uppercase">La Cueva</p>
            <p className="font-heading text-base font-semibold uppercase tracking-wide text-white">Dashboard SRXFit</p>
          </div>
          <button
            onClick={toggleCollapsed}
            aria-label="Esconder menú"
            title="Esconder menú ( [ )"
            className="hidden md:inline-flex p-1 -mr-1 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white transition"
          >
            <PanelLeftClose className="size-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="md:hidden p-1 -mr-1 rounded-md hover:bg-sidebar-accent transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 px-2.5 py-3 text-sm overflow-y-auto">
          {groups.map((group, gi) => {
            const link = (item: NavItem, icon?: LucideIcon) => {
              const Icon = icon;
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-1.5 transition ${
                    active ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-white"
                  }`}
                >
                  {Icon && <Icon className="size-4 shrink-0 opacity-80" />}
                  <span className={`flex-1 truncate ${Icon ? "" : "pl-[26px]"}`}>{item.label}</span>
                  {item.badge ? (
                    <span
                      className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-medium leading-5 text-white"
                      title="Tareas tuyas o de tu recepción para hoy o vencidas"
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            };
            // Loose items (Resumen) render as plain links with their own icon.
            if (!group.label) return <div key={gi} className="mb-2 space-y-0.5">{group.items.map((i) => link(i, Home))}</div>;
            const Icon = GROUP_ICON[group.label];
            const isOpen = group.label === activeGroup || openGroups.has(group.label);
            const badge = group.items.reduce((n, i) => n + (i.badge ?? 0), 0);
            return (
              <div key={group.label} className="mt-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label!)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left transition hover:bg-sidebar-accent/70 hover:text-white ${
                    isOpen ? "text-white" : "text-sidebar-foreground/85"
                  }`}
                >
                  {Icon && <Icon className="size-4 shrink-0 opacity-80" />}
                  <span className="flex-1 font-medium">{group.label}</span>
                  {!isOpen && badge > 0 && (
                    <span className="min-w-5 rounded-full bg-destructive px-1.5 text-center text-[11px] font-medium leading-5 text-white">{badge}</span>
                  )}
                  <ChevronDown className={`size-3.5 opacity-60 transition ${isOpen ? "" : "-rotate-90"}`} />
                </button>
                {isOpen && <div className="mt-0.5 space-y-0.5">{group.items.map((i) => link(i))}</div>}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-4 space-y-2 [&_.text-foreground]:text-sidebar-foreground [&_.text-muted-foreground]:text-sidebar-foreground/60 [&_.text-primary]:text-white">
          <div>
            <p className="text-sm font-medium truncate text-white">{userName}</p>
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
            className="block w-full text-left text-xs text-muted-foreground hover:text-white transition"
          >
            Cambiar contraseña
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left text-xs text-muted-foreground hover:text-white transition"
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
              aria-label={pendingTotal > 0 ? `Mostrar menú (${pendingTotal} pendientes)` : "Mostrar menú"}
              title="Mostrar menú ( [ )"
              className="relative -ml-2 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {pendingDot}
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
