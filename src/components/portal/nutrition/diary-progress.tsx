"use client";

import { useState } from "react";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { WeightChart } from "@/components/portal/weight-chart";
import { ADHERENCE_META, type AdherenceLevel } from "@/lib/nutrition/adherence";
import { loggingStreak } from "@/lib/nutrition/progress";

type Day = { date: string; kcal: number; proteinG: number; carbsG: number; fatG: number; adherence: AdherenceLevel | null };

export function DiaryProgress({
  days,
  targetKcal,
  targetProtein,
  weights,
}: {
  days: Day[];
  targetKcal: number | null;
  targetProtein: number | null;
  weights: { date: string; weight: number }[];
}) {
  const [range, setRange] = useState<7 | 30>(7);
  const shown = days.slice(-range);
  const logged = shown.filter((d) => d.kcal > 0);
  const avg = (k: "kcal" | "proteinG" | "carbsG" | "fatG") =>
    logged.length ? Math.round(logged.reduce((a, d) => a + d[k], 0) / logged.length) : 0;
  const onTarget = targetKcal ? logged.filter((d) => Math.abs(d.kcal - targetKcal) <= targetKcal * 0.1).length : 0;
  const colored = shown.filter((d) => d.adherence);
  const good = colored.filter((d) => d.adherence === "GREEN" || d.adherence === "YELLOW").length;

  const data = shown.map((d) => {
    const [, m, dd] = d.date.split("-");
    return { label: `${Number(dd)}/${Number(m)}`, kcal: d.kcal };
  });

  const stat = (label: string, value: string, hint?: string) => (
    <div className="portal-card" style={{ padding: 12 }}>
      <div className="portal-kicker" style={{ marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--pt-ink-3)" }}>{hint}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([7, 30] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 13,
              border: "1px solid var(--pt-line)",
              background: range === r ? "var(--pt-ink)" : "transparent",
              color: range === r ? "#fff" : "var(--pt-ink-2)",
              cursor: "pointer",
            }}
          >
            {r} días
          </button>
        ))}
      </div>

      <section className="portal-card" style={{ marginBottom: 12 }}>
        <div className="portal-kicker">Calorías por día</div>
        <div style={{ width: "100%", height: 170 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 4, left: -18, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={range === 7 ? 0 : 4} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                contentStyle={{ fontSize: 11, border: "1px solid #e8e5dc", borderRadius: 8, padding: "6px 8px" }}
                formatter={(v) => [`${v} kcal`, "Consumido"]}
              />
              {targetKcal && <ReferenceLine y={targetKcal} stroke="#1f8f74" strokeDasharray="4 3" />}
              <Bar dataKey="kcal" fill="#0b0b0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {targetKcal && <div style={{ fontSize: 11, color: "var(--pt-ink-3)" }}>Línea verde: tu meta de {targetKcal} kcal</div>}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        {stat("Racha", `${loggingStreak(days)} días`, "registrando seguido")}
        {stat("Días registrados", `${logged.length}/${shown.length}`)}
        {stat("Promedio", `${avg("kcal")} kcal`, targetKcal ? `meta ${targetKcal}` : undefined)}
        {stat("Proteína promedio", `${avg("proteinG")} g`, targetProtein ? `meta ${targetProtein} g` : undefined)}
        {targetKcal ? stat("En meta (±10%)", `${onTarget} días`) : null}
        {colored.length > 0 ? stat("Plan cumplido", `${Math.round((good / colored.length) * 100)}%`, "días verdes o amarillos") : null}
      </div>

      {colored.length > 0 && (
        <section className="portal-card" style={{ marginBottom: 12 }}>
          <div className="portal-kicker">Semáforo del plan</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {shown.map((d) => (
              <span
                key={d.date}
                title={d.date}
                style={{ width: 16, height: 16, borderRadius: 8, border: "1px solid var(--pt-line)", background: d.adherence ? ADHERENCE_META[d.adherence].color : "transparent" }}
              />
            ))}
          </div>
        </section>
      )}

      {weights.length > 1 && (
        <section className="portal-card">
          <div className="portal-kicker">Tu peso</div>
          <WeightChart data={weights} />
        </section>
      )}
    </div>
  );
}
