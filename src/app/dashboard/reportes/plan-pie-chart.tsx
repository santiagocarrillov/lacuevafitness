"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

const COLORS = ["#4f46e5", "#db2777", "#059669", "#d97706", "#0891b2", "#7c3aed", "#dc2626"];

export function PlanPieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={80}
          dataKey="value"
          label={(entry) => `${entry.name}: ${entry.value}`}
          labelLine={false}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
