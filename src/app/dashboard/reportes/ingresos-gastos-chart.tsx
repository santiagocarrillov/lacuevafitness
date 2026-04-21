"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export function IngresosGastosChart({
  data,
}: {
  data: { label: string; revenue: number; expenses: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" fontSize={10} />
        <YAxis fontSize={10} />
        <Tooltip formatter={(value) => `$${Number(value).toLocaleString("es-EC")}`} />
        <Legend wrapperStyle={{ fontSize: "11px" }} />
        <Line type="monotone" dataKey="revenue" name="Facturación" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="expenses" name="Gastos" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
