"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSwapsForEntry, removeFoodLogEntry, swapFoodLogEntry, updateFoodLogEntry } from "@/lib/actions/food-log";
import { MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";
import type { Swap } from "@/lib/nutrition/swap";
import type { DiaryEntryVm } from "@/lib/portal/food-diary";
import { SheetHeader, inputStyle, primaryBtn, sheetStyle } from "./add-food-sheet";

export function EntrySheet({ entry, meals, onClose }: { entry: DiaryEntryVm; meals: MealKey[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(String(entry.isRecipe ? entry.servings ?? 1 : entry.grams ?? ""));
  const [meal, setMeal] = useState<MealKey>(entry.mealKey);
  const [swaps, setSwaps] = useState<{ swaps: Swap[]; groupLabel: string | null } | null>(null);
  const hasAmount = entry.isRecipe || entry.grams !== null;

  useEffect(() => {
    if (!entry.canSwap) return;
    let cancelled = false;
    getSwapsForEntry(entry.id)
      .then((s) => {
        if (!cancelled) setSwaps(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.canSwap]);

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <div style={sheetStyle}>
      <SheetHeader title="Editar" onClose={onClose} />
      <div style={{ padding: 16, display: "grid", gap: 14, overflowY: "auto", background: "var(--pt-bg-card)", flex: 1 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{entry.name}</div>
          <div style={{ fontSize: 13, color: "var(--pt-ink-3)" }}>
            {entry.amount} · {entry.kcal} kcal · P {entry.proteinG} · C {entry.carbsG} · G {entry.fatG}
          </div>
        </div>

        {hasAmount && (
          <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--pt-ink-2)" }}>
            {entry.isRecipe ? "Porciones" : "Cantidad (g)"}
            <input style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
          </label>
        )}
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--pt-ink-2)" }}>
          Comida
          <select style={inputStyle} value={meal} onChange={(e) => setMeal(e.target.value as MealKey)}>
            {meals.map((k) => (
              <option key={k} value={k}>
                {MEAL_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {error && <p style={{ color: "var(--pt-red)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button
          type="button"
          disabled={pending}
          style={primaryBtn}
          onClick={() =>
            run(() =>
              updateFoodLogEntry(entry.id, {
                mealKey: meal !== entry.mealKey ? meal : null,
                grams: !entry.isRecipe && hasAmount ? Number(amount) : null,
                servings: entry.isRecipe ? Number(amount) : null,
              }),
            )
          }
        >
          Guardar
        </button>

        {entry.canSwap && (
          <div>
            <div className="portal-kicker">Cambiar por… {swaps?.groupLabel ? `(mismo grupo: ${swaps.groupLabel.toLowerCase()})` : ""}</div>
            {!swaps ? (
              <p style={{ fontSize: 13, color: "var(--pt-ink-3)" }}>Buscando equivalentes…</p>
            ) : swaps.swaps.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--pt-ink-3)" }}>No hay equivalentes cargados para este alimento.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {swaps.swaps.map((s) => (
                  <button
                    key={s.food.id}
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => swapFoodLogEntry(entry.id, s.food.id, s.grams))}
                    style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--pt-line)", background: "var(--pt-bg-card)", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ fontSize: 14 }}>
                      {s.food.name}
                      <span style={{ display: "block", fontSize: 12, color: "var(--pt-ink-3)" }}>
                        {s.grams} {s.food.isLiquid ? "ml" : "g"} · P {s.proteinG}
                      </span>
                    </span>
                    <span style={{ fontSize: 13, color: "var(--pt-ink-2)", whiteSpace: "nowrap" }}>{s.kcal} kcal</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => removeFoodLogEntry(entry.id))}
          style={{ background: "none", border: "none", color: "var(--pt-red)", fontSize: 14, cursor: "pointer", padding: 8 }}
        >
          Quitar del diario
        </button>
      </div>
    </div>
  );
}
