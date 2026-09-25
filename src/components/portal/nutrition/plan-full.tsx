"use client";

import { useState } from "react";
import type { ExchangeGroup } from "@/lib/nutrition/exchanges";
import type { Equivalent } from "@/lib/portal/nutrition-plan";
import { EquivalentsList } from "./plan-today";
import type { VmDay } from "./view-model";

/** The whole plan, read-only: every day's meals with all options, or the exchange table + equivalents. */
export function PlanFull({
  days,
  todayIndex,
  kind,
  notes,
  recommendations,
  equivalents,
}: {
  days: VmDay[];
  todayIndex: number;
  kind: "MENU" | "EXCHANGES";
  notes: string | null;
  recommendations: string[];
  equivalents: Partial<Record<ExchangeGroup, Equivalent[]>>;
}) {
  const [idx, setIdx] = useState(todayIndex);
  const day = days[idx] ?? days[0];
  const groups = [...new Set(days.flatMap((d) => d.meals.flatMap((m) => m.groups.map((g) => g.group))))];
  const groupLabel = Object.fromEntries(days.flatMap((d) => d.meals.flatMap((m) => m.groups.map((g) => [g.group, g.label]))));

  return (
    <div>
      {days.length > 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }}>
          {days.map((d, i) => (
            <button
              key={String(d.day)}
              type="button"
              onClick={() => setIdx(i)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 13,
                whiteSpace: "nowrap",
                border: "1px solid var(--pt-line)",
                background: i === idx ? "var(--pt-ink)" : "transparent",
                color: i === idx ? "#fff" : "var(--pt-ink-2)",
                cursor: "pointer",
              }}
            >
              {d.label.slice(0, 3)}
              {i === todayIndex ? " · hoy" : ""}
            </button>
          ))}
        </div>
      )}

      {day.meals.map((m) => (
        <section key={m.key} className="portal-card" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontFamily: "var(--pt-font-cond)", fontSize: 17, fontWeight: 600, textTransform: "uppercase" }}>
              {m.label} {m.time && <span style={{ fontSize: 11, color: "var(--pt-ink-3)", fontWeight: 400 }}>{m.time}</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>≈ {m.kcal} kcal</div>
          </div>
          {m.options.map((o) => (
            <div key={o.id} style={{ marginTop: 10 }}>
              {o.label && <div className="portal-kicker" style={{ marginBottom: 4 }}>{o.label} · {o.kcal} kcal</div>}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
                {o.items.map((it, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                    <span>{it.name}</span>
                    <span style={{ color: "var(--pt-ink-2)", fontSize: 13, whiteSpace: "nowrap" }}>{it.amount}</span>
                  </li>
                ))}
              </ul>
              {o.notes && <p style={{ fontSize: 12, color: "var(--pt-ink-2)", marginTop: 6, whiteSpace: "pre-wrap" }}>{o.notes}</p>}
            </div>
          ))}
          {m.groups.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {m.groups.map((g) => (
                <span key={g.group} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 13, background: "var(--pt-bg-card-alt)" }}>
                  <strong>{g.count}</strong> × {g.label}
                </span>
              ))}
            </div>
          )}
          {m.notes && <p style={{ fontSize: 12, color: "var(--pt-ink-2)", marginTop: 8 }}>{m.notes}</p>}
          {m.options.length === 0 && m.groups.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--pt-ink-3)", marginTop: 6 }}>Sin indicaciones para esta comida.</p>
          )}
        </section>
      ))}

      {kind === "EXCHANGES" && groups.length > 0 && (
        <>
          <div className="portal-section-title">
            <h4>Lista de equivalencias</h4>
          </div>
          {groups.map((g) => (
            <details key={g} className="portal-card" style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>1 intercambio de {String(groupLabel[g]).toLowerCase()}</summary>
              <div style={{ marginTop: 10 }}>
                <EquivalentsList items={equivalents[g as ExchangeGroup] ?? []} />
              </div>
            </details>
          ))}
        </>
      )}

      {(notes || recommendations.length > 0) && (
        <section className="portal-card-alt" style={{ marginTop: 14 }}>
          <div className="portal-kicker">Indicaciones de tu nutricionista</div>
          {notes && <p style={{ fontSize: 14, whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{notes}</p>}
          {recommendations.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 14, display: "grid", gap: 4 }}>
              {recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
