"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { RANGE_PRESETS } from "@/lib/payments/filters";

const fmt = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Date range of a list: presets (Este mes, Mes pasado…) or any desde–hasta. Lives in the URL. */
export function RangeFilter({ desde, hasta, rango }: { desde: string; hasta: string; rango: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(desde);
  const [to, setTo] = useState(hasta);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFrom(desde);
    setTo(hasta);
  }, [desde, hasta]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString());
    for (const k of ["rango", "desde", "hasta", "mes", "page"]) q.delete(k);
    for (const [k, v] of Object.entries(patch)) if (v) q.set(k, v);
    router.push(`${pathname}?${q}`, { scroll: false });
    setOpen(false);
  };

  const preset = RANGE_PRESETS.find((p) => p.value === rango);
  const label = preset ? preset.label : desde === hasta ? fmt(desde) : `${fmt(desde)} – ${fmt(hasta)}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium shadow-sm hover:border-stone-500"
      >
        <CalendarRange className="size-4 text-[#0f9f8f]" />
        {label}
        {preset && <span className="hidden text-xs font-normal text-muted-foreground sm:inline">{desde === hasta ? fmt(desde) : `${fmt(desde)} – ${fmt(hasta)}`}</span>}
        <ChevronDown className="size-3.5 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border bg-white p-2 shadow-lg">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => go({ rango: p.value })}
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-stone-100 ${p.value === rango ? "font-medium" : ""}`}
            >
              {p.label}
              {p.value === rango && <Check className="size-3.5" />}
            </button>
          ))}
          <div className="mt-2 space-y-2 border-t px-1 pt-3">
            <p className="text-xs font-medium text-muted-foreground">Personalizado</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                Desde
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-8 w-full rounded-md border px-2 text-sm text-foreground" />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                Hasta
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8 w-full rounded-md border px-2 text-sm text-foreground" />
              </label>
            </div>
            <button
              type="button"
              disabled={!from || !to}
              onClick={() => go({ desde: from, hasta: to })}
              className="h-8 w-full rounded-md bg-stone-900 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
