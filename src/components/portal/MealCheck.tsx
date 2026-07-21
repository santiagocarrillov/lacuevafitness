"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logMeal } from "@/lib/actions/nutrition";

type Level = "GREEN" | "YELLOW" | "ORANGE" | "RED";

const LEVELS: { value: Level; label: string; hint: string; color: string }[] = [
  { value: "GREEN", label: "Verde", hint: "+80%", color: "#16a34a" },
  { value: "YELLOW", label: "Amarillo", hint: "60–80%", color: "#eab308" },
  { value: "ORANGE", label: "Naranja", hint: "40–60%", color: "#f97316" },
  { value: "RED", label: "Rojo", hint: "–40%", color: "#ef4444" },
];

export function MealCheck({
  initialAdherence,
  initialFreeText,
}: {
  initialAdherence: Level | null;
  initialFreeText: string | null;
}) {
  const router = useRouter();
  const [adherence, setAdherence] = useState<Level | null>(initialAdherence);
  const [freeText, setFreeText] = useState(initialFreeText ?? "");
  const [isPending, startTransition] = useTransition();

  function persist(nextAdherence: Level | null, nextFreeText: string) {
    startTransition(async () => {
      try {
        await logMeal({ adherence: nextAdherence, freeText: nextFreeText || undefined });
        router.refresh();
      } catch {
        setAdherence(initialAdherence);
      }
    });
  }

  function pick(level: Level) {
    const next = adherence === level ? null : level; // tap again to unset
    setAdherence(next);
    persist(next, freeText);
  }

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <div style={{ fontSize: 13, color: "var(--pt-ink-2)", fontWeight: 500 }}>
        ¿Cuánto cumpliste tu plan hoy?
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {LEVELS.map((l) => {
          const selected = adherence === l.value;
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => pick(l.value)}
              disabled={isPending}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "10px 4px",
                borderRadius: 10,
                border: selected ? `2px solid ${l.color}` : "1px solid var(--pt-line)",
                background: selected ? l.color : "transparent",
                color: selected ? "#fff" : "var(--pt-ink-2)",
                cursor: "pointer",
                transition: "all .12s",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: selected ? "#fff" : l.color,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 700 }}>{l.label}</span>
              <span style={{ fontSize: 10, opacity: 0.85 }}>{l.hint}</span>
            </button>
          );
        })}
      </div>

      <textarea
        placeholder="¿Comiste algo distinto? Escríbelo aquí…"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        onBlur={() => {
          if ((freeText || "") !== (initialFreeText ?? "")) persist(adherence, freeText);
        }}
        rows={2}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--pt-line)",
          background: "var(--pt-bg-card)",
          color: "var(--pt-ink-1)",
          fontSize: 13,
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}
