"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  CalendarCheck,
  ChevronDown,
  Dumbbell,
  Flag,
  ListChecks,
  MessageCircle,
  Phone,
  Receipt,
  Salad,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import type { TimelineItem, TimelineKind } from "@/lib/ficha/timeline";

const ICON: Record<TimelineKind, typeof Activity> = {
  nota: StickyNote,
  contacto: Phone,
  whatsapp: MessageCircle,
  tarea: ListChecks,
  membresia: CalendarCheck,
  pago: Receipt,
  asistencia: Dumbbell,
  salud: Activity,
  nutricion: Salad,
  sistema: Flag,
};

const TONE: Record<NonNullable<TimelineItem["tone"]>, string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  bad: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
};

/**
 * "Actividad reciente": todo lo que pasó con la persona, agrupado por mes, con
 * buscador y filtro por tipo (el chip "Actividad (5/9)" de HubSpot).
 */
export function Timeline({
  items,
  labels,
  underTabs = false,
}: {
  items: TimelineItem[];
  labels: Record<TimelineKind, string>;
  /** The page has sticky tabs above: month headers stick below them. */
  underTabs?: boolean;
}) {
  const present = useMemo(() => {
    const seen = new Map<TimelineKind, number>();
    for (const i of items) seen.set(i.kind, (seen.get(i.kind) ?? 0) + 1);
    return (Object.keys(labels) as TimelineKind[]).filter((k) => seen.has(k)).map((k) => ({ kind: k, count: seen.get(k)! }));
  }, [items, labels]);

  const [hidden, setHidden] = useState<Set<TimelineKind>>(new Set());
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [limit, setLimit] = useState(60);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        !hidden.has(i.kind) &&
        (!needle || `${i.title} ${i.body ?? ""} ${i.by ?? ""} ${(i.details ?? []).join(" ")}`.toLowerCase().includes(needle)),
    );
  }, [items, hidden, q]);

  const months = useMemo(() => {
    const groups: { key: string; label: string; items: TimelineItem[] }[] = [];
    for (const i of filtered.slice(0, limit)) {
      const last = groups[groups.length - 1];
      if (last?.key === i.monthKey) last.items.push(i);
      else groups.push({ key: i.monthKey, label: i.monthLabel, items: [i] });
    }
    return groups;
  }, [filtered, limit]);

  const toggle = (k: TimelineKind) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const shownKinds = present.filter((p) => !hidden.has(p.kind)).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 py-1">
        <h2 className="mr-auto text-sm font-semibold">Actividad</h2>
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en la actividad"
            className="h-8 w-48 rounded-md border border-border bg-card pl-7 pr-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium hover:bg-muted"
          >
            Actividad ({shownKinds}/{present.length}) <ChevronDown className="size-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-border bg-background p-1 shadow-lg">
              {present.map((p) => (
                <label key={p.kind} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" checked={!hidden.has(p.kind)} onChange={() => toggle(p.kind)} className="accent-primary" />
                  <span className="flex-1">{labels[p.kind]}</span>
                  <span className="text-xs text-muted-foreground">{p.count}</span>
                </label>
              ))}
              <div className="flex justify-between border-t border-border px-2 pt-1.5 text-xs">
                <button type="button" className="text-primary hover:underline" onClick={() => setHidden(new Set())}>
                  Todo
                </button>
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setMenuOpen(false)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
        {hidden.size > 0 && (
          <button
            type="button"
            onClick={() => setHidden(new Set())}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-muted px-3 text-xs"
            title="Quitar filtro"
          >
            {hidden.size} tipo{hidden.size === 1 ? "" : "s"} oculto{hidden.size === 1 ? "" : "s"} <X className="size-3" />
          </button>
        )}
      </div>

      {months.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "Todavía no hay actividad con esta persona." : "Nada coincide con el filtro."}
        </p>
      ) : (
        <div className="pb-4">
          {months.map((m) => (
            <section key={m.key}>
              <h3 className={`-mx-1 bg-muted/95 lg:sticky lg:z-[1] ${underTabs ? "lg:top-10" : "lg:top-0"} px-1 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur`}>
                {m.label}
              </h3>
              <ol className="space-y-2">
                {m.items.map((i) => (
                  <Entry key={i.id} item={i} />
                ))}
              </ol>
            </section>
          ))}
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 100)}
              className="mt-4 w-full rounded-md border border-border bg-card py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Ver más ({filtered.length - limit})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Entry({ item }: { item: TimelineItem }) {
  const Icon = ICON[item.kind];
  const [open, setOpen] = useState(false);
  const title = item.href ? (
    item.href.startsWith("http") ? (
      <a href={item.href} target="_blank" rel="noreferrer" className="hover:underline">
        {item.title}
      </a>
    ) : (
      <Link href={item.href} className="hover:underline">
        {item.title}
      </Link>
    )
  ) : (
    item.title
  );
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
      <span
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border ${
          item.tone ? TONE[item.tone] : "border-border bg-muted/60 text-muted-foreground"
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">{title}</p>
          <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.at}>
            {item.when}
          </time>
        </div>
        {item.body && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-foreground">{item.body}</p>}
        {item.details && item.details.length > 0 && (
          <div className="mt-1">
            <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs text-primary hover:underline">
              {open ? "Ocultar detalle" : "Ver detalle"}
            </button>
            {open && (
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {item.details.map((d, n) => (
                  <li key={n}>· {d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {item.by && <p className="mt-1 text-xs text-muted-foreground">por {item.by}</p>}
      </div>
    </li>
  );
}
