"use client";

import { useState } from "react";
import { MarkdownText } from "@/lib/srxfit-md";

export type RoutineDay = {
  dayIndex: number; // 1=Mon … 6=Sat
  dayName: string;
  emphasis: string;
  pattern: string;
  dayType: string;
  phase: string;
  weekSummary: string;
  activacion: string;
  fuerza: string;
  acondicionamiento: string;
  regulacion: string;
};

export type RoutineWeekData = {
  weekNumber: number;
  todayDayIndex: number | null; // 1..6, or null on Sunday / off-plan
  days: RoutineDay[];
};

const DAY_ABBR: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

const PHASE_COLOR: Record<string, string> = {
  Aprender: "#2563eb",
  Desarrollar: "#d97706",
  Desafiar: "#e11d48",
  Recuperar: "#16a34a",
  "Re-evaluación": "#9333ea",
};

const BLOCKS: { key: keyof RoutineDay; label: string }[] = [
  { key: "activacion", label: "Activación" },
  { key: "fuerza", label: "Fuerza" },
  { key: "acondicionamiento", label: "Acondicionamiento" },
  { key: "regulacion", label: "Regulación" },
];

export function RoutineWeek({ data }: { data: RoutineWeekData }) {
  const initial = data.todayDayIndex ?? data.days[0]?.dayIndex ?? 1;
  const [selected, setSelected] = useState(initial);
  const day = data.days.find((d) => d.dayIndex === selected) ?? data.days[0];

  if (!day) return null;

  const phaseColor = PHASE_COLOR[day.phase] ?? "var(--pt-ink-3)";
  const hasContent =
    day.activacion || day.fuerza || day.acondicionamiento || day.regulacion;

  return (
    <section className="portal-card" style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div className="portal-kicker">Tu rutina de la semana</div>
        <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
          Semana {data.weekNumber}
        </div>
      </div>

      {/* Day selector */}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {data.days.map((d) => {
          const isSelected = d.dayIndex === selected;
          const isToday = d.dayIndex === data.todayDayIndex;
          return (
            <button
              key={d.dayIndex}
              type="button"
              onClick={() => setSelected(d.dayIndex)}
              style={{
                flex: "1 1 0",
                minWidth: 42,
                padding: "6px 0",
                borderRadius: 10,
                border: isSelected
                  ? "1.5px solid var(--pt-ink-1)"
                  : "1px solid var(--pt-line)",
                background: isSelected ? "var(--pt-ink-1)" : "transparent",
                color: isSelected ? "var(--pt-bg, #fff)" : "var(--pt-ink-2)",
                fontSize: 12,
                fontWeight: isSelected ? 700 : 500,
                cursor: "pointer",
                position: "relative",
              }}
            >
              {DAY_ABBR[d.dayIndex]}
              {isToday && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: isSelected ? "var(--pt-bg, #fff)" : phaseColor,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day header */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{day.dayName}</span>
          {day.phase && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: phaseColor,
                border: `1px solid ${phaseColor}`,
                borderRadius: 999,
                padding: "1px 8px",
              }}
            >
              {day.phase}
            </span>
          )}
        </div>
        {(day.emphasis || day.pattern || day.dayType) && (
          <div style={{ fontSize: 13, color: "var(--pt-ink-2)", marginTop: 3 }}>
            {[day.emphasis, day.pattern, day.dayType].filter(Boolean).join(" · ")}
          </div>
        )}
        {day.weekSummary && (
          <div style={{ fontSize: 12, color: "var(--pt-ink-3)", marginTop: 6, fontStyle: "italic" }}>
            {day.weekSummary}
          </div>
        )}
      </div>

      {/* Blocks */}
      {hasContent ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {BLOCKS.map(({ key, label }) => {
            const md = day[key] as string;
            if (!md) return null;
            return (
              <div key={key}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--pt-ink-3)",
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <MarkdownText source={md} />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--pt-ink-3)" }}>
          Día de descanso o sin rutina programada.
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "var(--pt-ink-3)" }}>
        La programación puede ajustarse en el gimnasio según tu coach.
      </div>
    </section>
  );
}
