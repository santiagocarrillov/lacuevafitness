"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BlockRow } from "@/lib/srxfit/group-stats";

export function BlockChart({ rows }: { rows: BlockRow[] }) {
  if (rows.length < 2) return <p className="text-sm text-muted-foreground">Hace falta más de un bloque con datos para ver la tendencia.</p>;
  const data = rows.map((r) => ({ name: r.block === 0 ? "Antes" : `B${r.block}`, grasa: r.bodyFatAvg, banca: r.benchAvg, sentadilla: r.squatAvg, n: r.n }));
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#ecebe8" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis yAxisId="kg" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis yAxisId="pct" orientation="right" tickLine={false} axisLine={false} fontSize={11} unit="%" />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v, name) => [name === "grasa" ? `${v}%` : `${v} kg`, name === "grasa" ? "% grasa" : name === "banca" ? "Press banca 3RM" : "Sentadilla 3RM"]} />
          <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => (v === "grasa" ? "% grasa" : v === "banca" ? "Press banca" : "Sentadilla")} />
          <Line yAxisId="pct" type="monotone" dataKey="grasa" stroke="#e5533f" strokeWidth={2} dot connectNulls />
          <Line yAxisId="kg" type="monotone" dataKey="banca" stroke="#3a8fd1" strokeWidth={2} dot connectNulls />
          <Line yAxisId="kg" type="monotone" dataKey="sentadilla" stroke="#6b4fb5" strokeWidth={2} dot connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
