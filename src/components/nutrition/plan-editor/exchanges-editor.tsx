"use client";

import Link from "next/link";
import { EXCHANGE_GROUPS, EXCHANGE_LABEL, type ExchangeGroup } from "@/lib/nutrition/exchanges";
import {
  EXCHANGE_MACROS,
  enabledMeals,
  exchangeMealTotals,
  type ExchangeMeal,
  type PlanContent,
} from "@/lib/nutrition/plan-schema";
import { MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";

// FREE foods aren't counted — they're "libres" by definition.
const GROUPS = EXCHANGE_GROUPS.filter((g) => g !== "FREE");

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-md border border-input">
      <button type="button" className="px-1.5 text-muted-foreground hover:text-foreground" onClick={() => onChange(Math.max(0, value - 0.5))} aria-label="Menos">
        −
      </button>
      <span className={`w-7 text-center text-sm tabular-nums ${value ? "font-semibold" : "text-muted-foreground"}`}>{value || "·"}</span>
      <button type="button" className="px-1.5 text-muted-foreground hover:text-foreground" onClick={() => onChange(Math.min(20, value + 0.5))} aria-label="Más">
        +
      </button>
    </div>
  );
}

export function ExchangesEditor({
  content,
  onChange,
  mealTargets,
}: {
  content: PlanContent;
  onChange: (c: PlanContent) => void;
  mealTargets: Partial<Record<MealKey, number>>;
}) {
  const keys = enabledMeals(content);
  const meal = (k: MealKey): ExchangeMeal => content.exchanges.find((e) => e.key === k) ?? { key: k, groups: {}, notes: null };

  function setMeal(k: MealKey, next: ExchangeMeal) {
    const exists = content.exchanges.some((e) => e.key === k);
    onChange({
      ...content,
      exchanges: exists ? content.exchanges.map((e) => (e.key === k ? next : e)) : [...content.exchanges, next],
    });
  }

  const dayGroups = Object.fromEntries(
    GROUPS.map((g) => [g, keys.reduce((a, k) => a + (meal(k).groups[g] ?? 0), 0)]),
  ) as Record<ExchangeGroup, number>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Comida</th>
              {GROUPS.map((g) => (
                <th key={g} className="px-1 py-2 text-center font-medium">
                  {EXCHANGE_LABEL[g].split(" ")[0]}
                  <span className="block text-[10px] font-normal">{EXCHANGE_MACROS[g].kcal} kcal</span>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">kcal</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.map((k) => {
              const m = meal(k);
              const t = exchangeMealTotals(m);
              const target = mealTargets[k];
              const slot = content.meals.find((s) => s.key === k);
              return (
                <tr key={k}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{slot?.label || MEAL_LABEL[k]}</div>
                    <input
                      value={m.notes ?? ""}
                      onChange={(e) => setMeal(k, { ...m, notes: e.target.value || null })}
                      placeholder="nota…"
                      className="mt-1 w-36 border-b border-dashed border-input bg-transparent text-xs outline-none"
                    />
                  </td>
                  {GROUPS.map((g) => (
                    <td key={g} className="px-1 py-2 text-center">
                      <Stepper
                        value={m.groups[g] ?? 0}
                        onChange={(v) => setMeal(k, { ...m, groups: { ...m.groups, [g]: v } })}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={target && Math.abs(t.kcal - target) > target * 0.15 ? "text-amber-700" : ""}>{t.kcal}</span>
                    {target ? <span className="block text-[10px] text-muted-foreground">meta ≈{target}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t bg-muted/40 text-xs">
            <tr>
              <td className="px-3 py-2 font-medium">Total del día</td>
              {GROUPS.map((g) => (
                <td key={g} className="px-1 py-2 text-center tabular-nums font-medium">
                  {dayGroups[g] || "·"}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        El socio ve cuántos intercambios de cada grupo le tocan por comida y la lista de equivalencias con sus gramos (sale de
        la{" "}
        <Link href="/dashboard/nutricion/alimentos" className="underline">
          base de alimentos
        </Link>{" "}
        según el grupo de cada uno). Pasos de ½ intercambio.
      </p>
    </div>
  );
}
