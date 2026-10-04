"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type FilterOption = { value: string; label: string };
export type FilterDef = { name: string; title: string; options: FilterOption[]; multi?: boolean };

function useUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const push = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return { sp, push };
}

/** Small dropdown anchored under its button; closes on outside click or Esc. */
function Dropdown({ button, children }: { button: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {button(open, () => setOpen((o) => !o))}
      {open && (
        <div className="absolute left-0 z-30 mt-1 min-w-56 rounded-lg border border-border bg-popover p-1 shadow-lg">{children(() => setOpen(false))}</div>
      )}
    </div>
  );
}

function Pill({ active, open, onClick, children }: { active: boolean; open: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium transition ${
        active ? "bg-primary text-primary-foreground" : open ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
      <ChevronDown className="size-3.5 opacity-60" />
    </button>
  );
}

function FilterDropdown({ def }: { def: FilterDef }) {
  const { sp, push } = useUrl();
  const raw = sp.get(def.name) ?? "";
  const values = def.multi ? raw.split(",").filter(Boolean) : raw ? [raw] : [];
  const label =
    values.length === 0
      ? def.title
      : values.length === 1
        ? `${def.title}: ${def.options.find((o) => o.value === values[0])?.label ?? values[0]}`
        : `${def.title} (${values.length})`;

  const pick = (v: string, close: () => void) => {
    if (def.multi) {
      const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
      push({ [def.name]: next.join(",") || null });
    } else {
      push({ [def.name]: values[0] === v ? null : v });
      close();
    }
  };

  return (
    <Dropdown
      button={(open, toggle) => (
        <Pill active={values.length > 0} open={open} onClick={toggle}>
          {label}
        </Pill>
      )}
    >
      {(close) => (
        <div className="max-h-80 overflow-y-auto">
          {def.options.map((o) => {
            const on = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o.value, close)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-muted ${on ? "font-medium" : ""}`}
              >
                {def.multi && (
                  <span className={`flex size-4 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {on && <Check className="size-3" />}
                  </span>
                )}
                <span className="flex-1">{o.label}</span>
                {!def.multi && on && <Check className="size-3.5" />}
              </button>
            );
          })}
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => {
                push({ [def.name]: null });
                close();
              }}
              className="mt-1 w-full border-t border-border px-2.5 pb-1 pt-2 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              Quitar filtro
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}

function SearchBox({ placeholder }: { placeholder: string }) {
  const { sp, push } = useUrl();
  const current = sp.get("q") ?? "";
  const [q, setQ] = useState(current);
  const [synced, setSynced] = useState(current);
  // Back/forward or a tab change: follow the URL.
  if (current !== synced) {
    setSynced(current);
    setQ(current);
  }
  useEffect(() => {
    if (q === current) return;
    const t = setTimeout(() => push({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-7 text-sm outline-none focus:border-primary"
      />
      {q && (
        <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Borrar búsqueda">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Filter row of a list (HubSpot/Gambit style): one dropdown per field, the
 * search box on the right, and "Limpiar" when anything is applied. Everything
 * lives in the URL so a filtered list can be linked (e.g. from the Resumen).
 */
export function FilterBar({ filters, searchPlaceholder }: { filters: FilterDef[]; searchPlaceholder: string }) {
  const { sp, push } = useUrl();
  const active = filters.some((f) => sp.get(f.name)) || !!sp.get("q");
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2 md:px-6">
      {filters.map((f) => (
        <FilterDropdown key={f.name} def={f} />
      ))}
      {active && (
        <button
          type="button"
          onClick={() => push(Object.fromEntries([...filters.map((f) => [f.name, null]), ["q", null]]))}
          className="ml-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" /> Limpiar
        </button>
      )}
      <div className="ml-auto w-full pt-1 sm:w-auto sm:pt-0">
        <SearchBox placeholder={searchPlaceholder} />
      </div>
    </div>
  );
}

/** Previous / next pages, keeping the filters. */
export function Pager({ page, totalPages, total, noun }: { page: number; totalPages: number; total: number; noun: string }) {
  const { sp } = useUrl();
  const router = useRouter();
  const pathname = usePathname();
  const go = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params}`);
  };
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground md:px-6">
      <span>
        {total.toLocaleString("es-EC")} {noun}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} className="h-8 rounded-md border border-border bg-card px-3 disabled:opacity-40">
            Anterior
          </button>
          <span className="px-2">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => go(page + 1)}
            className="h-8 rounded-md border border-border bg-card px-3 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
