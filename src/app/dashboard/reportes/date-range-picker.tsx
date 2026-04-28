"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DateRangePickerProps {
  from: string;
  to: string;
  sede: string;
  tab: string;
  detail?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon;
}

export function DateRangePicker({ from, to, sede, tab, detail }: DateRangePickerProps) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function navigate(newFrom: string, newTo: string) {
    const p = new URLSearchParams({ tab, sede, from: newFrom, to: newTo });
    if (detail) p.set("detail", detail);
    router.push(`/dashboard/reportes?${p.toString()}`);
  }

  function applyCustom() {
    if (customFrom && customTo) navigate(customFrom, customTo);
  }

  const today = new Date();
  const presets = [
    {
      label: "Esta semana",
      action: () => {
        const mon = startOfWeek(today);
        navigate(isoDate(mon), isoDate(today));
      },
    },
    {
      label: "Últimos 7 días",
      action: () => {
        const d = new Date(today);
        d.setDate(d.getDate() - 6);
        navigate(isoDate(d), isoDate(today));
      },
    },
    {
      label: "Este mes",
      action: () => {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        navigate(isoDate(first), isoDate(today));
      },
    },
    {
      label: "Mes anterior",
      action: () => {
        const firstPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastPrev = new Date(today.getFullYear(), today.getMonth(), 0);
        navigate(isoDate(firstPrev), isoDate(lastPrev));
      },
    },
    {
      label: "Últimos 30 días",
      action: () => {
        const d = new Date(today);
        d.setDate(d.getDate() - 29);
        navigate(isoDate(d), isoDate(today));
      },
    },
    {
      label: "Este año",
      action: () => {
        const first = new Date(today.getFullYear(), 0, 1);
        navigate(isoDate(first), isoDate(today));
      },
    },
  ];

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={p.action}
          className="px-2.5 py-1 text-xs rounded-md border hover:bg-accent transition"
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1 ml-2">
        <input
          type="date"
          value={customFrom}
          onChange={(e) => setCustomFrom(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="date"
          value={customTo}
          onChange={(e) => setCustomTo(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
        />
        <button
          onClick={applyCustom}
          className="h-7 px-2 text-xs rounded-md bg-primary text-primary-foreground"
        >
          Ver
        </button>
      </div>
    </div>
  );
}
