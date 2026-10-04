"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EXPENSE_COLOR, INCOME_COLOR } from "./chart-colors";

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("es-EC")}`;
const monthShort = (ym: string) =>
  new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("es-EC", { month: "short", timeZone: "UTC" }).replace(".", "");

export function DonutChart({ slices, totalLabel }: { slices: { label: string; cents: number; color: string; href: string }[]; totalLabel: string }) {
  const router = useRouter();
  if (slices.length === 0) {
    return <div className="flex size-36 items-center justify-center rounded-full border-[14px] border-muted text-xs text-muted-foreground">Sin datos</div>;
  }
  return (
    <div className="relative size-36 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="cents"
            nameKey="label"
            innerRadius="64%"
            outerRadius="100%"
            paddingAngle={slices.length > 1 ? 2 : 0}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive={false}
            onClick={(d) => router.push((d as unknown as { href: string }).href)}
            className="cursor-pointer"
          >
            {slices.map((s) => (
              <Cell key={s.label} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, name) => [usd(Number(v)), name]}
            contentStyle={{ borderRadius: 8, fontSize: 12, borderColor: "#e7e5e4" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{totalLabel}</span>
      </div>
    </div>
  );
}

/** Money in vs. money out, last 12 months. Clicking a month opens it (`basePath?mes=`). */
export function CashFlowChart({ data, current, basePath = "/dashboard/finanzas" }: { data: { ym: string; incomeCents: number; expensesCents: number }[]; current: string; basePath?: string }) {
  const router = useRouter();
  const rows = data.map((d) => ({ ...d, label: monthShort(d.ym) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={rows}
        barGap={2}
        barCategoryGap="22%"
        margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
        onClick={(s) => {
          const i = Number((s as { activeTooltipIndex?: number | string }).activeTooltipIndex);
          if (Number.isFinite(i) && rows[i]) router.push(`${basePath}${basePath.includes("?") ? "&" : "?"}mes=${rows[i].ym}`);
        }}
        className="cursor-pointer"
      >
        <CartesianGrid vertical={false} stroke="#ecebe8" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#78716c" }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          fontSize={11}
          tick={{ fill: "#78716c" }}
          tickFormatter={(v) => (v >= 100_000 ? `$${Math.round(v / 100_000)}K` : `$${Math.round(v / 100)}`)}
        />
        <Tooltip
          cursor={{ fill: "#f5f5f4" }}
          formatter={(v, name) => [usd(Number(v)), name === "incomeCents" ? "Entró" : "Salió"]}
          labelFormatter={(_, p) => {
            const ym = (p?.[0]?.payload as { ym?: string } | undefined)?.ym;
            return ym ? new Date(`${ym}-15T00:00:00Z`).toLocaleDateString("es-EC", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
          }}
          contentStyle={{ borderRadius: 8, fontSize: 12, borderColor: "#e7e5e4" }}
        />
        <Bar dataKey="incomeCents" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.ym} fill={INCOME_COLOR} fillOpacity={r.ym === current ? 1 : 0.55} />
          ))}
        </Bar>
        <Bar dataKey="expensesCents" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.ym} fill={EXPENSE_COLOR} fillOpacity={r.ym === current ? 1 : 0.55} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
