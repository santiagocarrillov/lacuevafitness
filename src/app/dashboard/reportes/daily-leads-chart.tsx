"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function DailyLeadsChart({ data }: { data: { date: string; count: number }[] }) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("es-EC", { day: "numeric", month: "short" }),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" fontSize={10} />
        <YAxis fontSize={10} />
        <Tooltip />
        <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
