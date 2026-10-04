"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FINANCE_MODULES, activeModule } from "./modules";

/**
 * Navigation of the accounting app: module pills with a coloured icon (like
 * Intuit's) and, under them, the screens of the module you're in. Keeps the
 * selected month.
 */
export function FinanceNav() {
  const path = usePathname();
  const params = useSearchParams();
  const loc = { path, params: new URLSearchParams(params.toString()) };
  const current = activeModule(loc);
  const mes = params.get("mes");
  const withMonth = (href: string) => {
    if (!mes) return href;
    return `${href}${href.includes("?") ? "&" : "?"}mes=${mes}`;
  };

  return (
    <nav aria-label="Contabilidad" className="sticky top-12 z-20 border-b bg-white/95 backdrop-blur md:top-11">
      <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-2 md:px-8 [scrollbar-width:none]">
        {FINANCE_MODULES.map((m) => {
          const on = current?.key === m.key;
          const Icon = m.icon;
          return (
            <Link
              key={m.key}
              href={withMonth(m.href)}
              aria-current={on ? "page" : undefined}
              className={`group flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium transition ${
                on ? "border-transparent shadow-sm" : "border-border bg-white text-foreground/80 hover:border-foreground/30 hover:text-foreground"
              }`}
              style={on ? { backgroundColor: `${m.color}14`, borderColor: `${m.color}55`, color: m.color } : undefined}
            >
              <span
                className="flex size-7 items-center justify-center rounded-full text-white transition group-hover:scale-105"
                style={{ backgroundColor: m.color }}
              >
                <Icon className="size-4" strokeWidth={2.25} />
              </span>
              <span className={on ? "text-foreground" : ""}>{m.label}</span>
            </Link>
          );
        })}
      </div>
      {current && current.subs.length > 0 && (
        <div className="flex gap-1 overflow-x-auto px-4 md:px-8 [scrollbar-width:none]">
          {current.subs.map((s) => {
            const on = s.active(loc);
            const Icon = s.icon;
            return (
              <Link
                key={s.label}
                href={withMonth(s.href)}
                aria-current={on ? "page" : undefined}
                className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
                  on ? "font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                style={on ? { borderColor: current.color } : undefined}
              >
                <Icon className="size-3.5" style={on ? { color: current.color } : undefined} />
                {s.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
