"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  from: string;
  to: string;
  sede: string;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function EvalDateRangePicker({ from, to, sede }: Props) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function navigate(f: string, t: string) {
    const p = new URLSearchParams({ sede, from: f, to: t });
    router.push(`/dashboard/srxfit/evaluaciones?${p.toString()}`);
  }

  const today = new Date();
  const presets = [
    {
      label: "Este mes",
      action() {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        navigate(isoDate(first), isoDate(today));
      },
    },
    {
      label: "Mes anterior",
      action() {
        const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const last = new Date(today.getFullYear(), today.getMonth(), 0);
        navigate(isoDate(first), isoDate(last));
      },
    },
    {
      label: "Últimos 90 días",
      action() {
        const d = new Date(today);
        d.setDate(d.getDate() - 89);
        navigate(isoDate(d), isoDate(today));
      },
    },
    {
      label: "Este año",
      action() {
        navigate(`${today.getFullYear()}-01-01`, isoDate(today));
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
      <div className="flex items-center gap-1 ml-1">
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
          onClick={() => { if (customFrom && customTo) navigate(customFrom, customTo); }}
          className="h-7 px-2 text-xs rounded-md bg-primary text-primary-foreground"
        >
          Ver
        </button>
      </div>
    </div>
  );
}
