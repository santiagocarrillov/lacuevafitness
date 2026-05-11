"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";

type Point = { date: string; weight: number };

export function WeightChart({ data }: { data: Point[] }) {
  if (data.length === 0) return null;
  return (
    <div style={{ width: "100%", height: 110 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ptWeightFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0a0a0a" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#0a0a0a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              border: "1px solid #e8e5dc",
              borderRadius: 8,
              padding: "6px 8px",
            }}
            formatter={(value) => [`${Number(value).toFixed(1)} kg`, "Peso"]}
            labelFormatter={(label) => label as string}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke="#0a0a0a"
            strokeWidth={1.5}
            fill="url(#ptWeightFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
