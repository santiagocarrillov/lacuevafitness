"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WEEKDAY_LABEL,
  emptyOption,
  enabledMeals,
  mealOptionsTotals,
  newOptionId,
  optionTotals,
  type MenuDay,
  type PlanContent,
  type PlanItem,
  type PlanOption,
} from "@/lib/nutrition/plan-schema";
import { MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";
import { ItemAdder, setItemAmount } from "./item-adder";

const MAX_OPTIONS = 3;

function cloneDay(d: MenuDay, day: MenuDay["day"]): MenuDay {
  return {
    day,
    meals: d.meals.map((m) => ({
      key: m.key,
      options: m.options.map((o) => ({ ...o, id: newOptionId(), items: o.items.map((i) => ({ ...i })) })),
    })),
  };
}

/** Ensures a day has an entry (with ≥1 option) for every enabled meal. */
function withMeals(d: MenuDay, keys: MealKey[]): MenuDay {
  const meals = keys.map((k) => d.meals.find((m) => m.key === k) ?? { key: k, options: [emptyOption()] });
  return { ...d, meals: meals.map((m) => (m.options.length ? m : { ...m, options: [emptyOption()] })) };
}

export function MenuEditor({
  content,
  onChange,
  mealTargets,
}: {
  content: PlanContent;
  onChange: (c: PlanContent) => void;
  mealTargets: Partial<Record<MealKey, number>>;
}) {
  const keys = enabledMeals(content);
  const perDay = !(content.days.length === 1 && content.days[0].day === "ALL");
  const [dayIdx, setDayIdx] = useState(0);
  const idx = Math.min(dayIdx, Math.max(0, content.days.length - 1));
  const day = withMeals(content.days[idx] ?? { day: "ALL", meals: [] }, keys);

  function setDay(next: MenuDay) {
    const days = content.days.length ? [...content.days] : [next];
    days[idx] = next;
    onChange({ ...content, days });
  }

  function setMealOptions(key: MealKey, options: PlanOption[]) {
    setDay({ ...day, meals: day.meals.map((m) => (m.key === key ? { ...m, options } : m)) });
  }

  function togglePerDay() {
    if (perDay) {
      if (!confirm("Se usará el menú del día seleccionado para todos los días. ¿Continuar?")) return;
      onChange({ ...content, days: [cloneDay(day, "ALL")] });
      setDayIdx(0);
    } else {
      onChange({ ...content, days: [1, 2, 3, 4, 5, 6, 7].map((n) => cloneDay(day, n)) });
      setDayIdx(0);
    }
  }

  function copyDayToAll() {
    if (!confirm(`¿Copiar el menú del ${WEEKDAY_LABEL[day.day as number]?.toLowerCase()} a todos los días?`)) return;
    onChange({ ...content, days: content.days.map((d) => (d.day === day.day ? d : cloneDay(day, d.day))) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-input overflow-hidden text-sm">
          <button type="button" onClick={() => perDay && togglePerDay()} className={`px-3 h-8 ${!perDay ? "bg-foreground text-background" : ""}`}>
            Mismo menú todos los días
          </button>
          <button type="button" onClick={() => !perDay && togglePerDay()} className={`px-3 h-8 ${perDay ? "bg-foreground text-background" : ""}`}>
            Menú por día
          </button>
        </div>
        {perDay && (
          <>
            <div className="flex flex-wrap gap-1">
              {content.days.map((d, i) => (
                <button
                  key={String(d.day)}
                  type="button"
                  onClick={() => setDayIdx(i)}
                  className={`rounded-md px-2 h-8 text-sm ${i === idx ? "bg-muted font-medium" : "text-muted-foreground"}`}
                >
                  {WEEKDAY_LABEL[d.day as number]?.slice(0, 3) ?? "Día"}
                </button>
              ))}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={copyDayToAll}>
              Copiar a todos los días
            </Button>
          </>
        )}
      </div>

      {keys.map((key) => {
        const meal = day.meals.find((m) => m.key === key)!;
        const slot = content.meals.find((m) => m.key === key);
        return (
          <MealCard
            key={`${idx}-${key}`}
            title={slot?.label || MEAL_LABEL[key]}
            time={slot?.time ?? null}
            options={meal.options}
            targetKcal={mealTargets[key]}
            onChange={(opts) => setMealOptions(key, opts)}
          />
        );
      })}
    </div>
  );
}

function MealCard({
  title,
  time,
  options,
  targetKcal,
  onChange,
}: {
  title: string;
  time: string | null;
  options: PlanOption[];
  targetKcal?: number;
  onChange: (o: PlanOption[]) => void;
}) {
  const [active, setActive] = useState(0);
  const i = Math.min(active, options.length - 1);
  const opt = options[i];
  const avg = mealOptionsTotals(options);

  function setOpt(next: PlanOption) {
    onChange(options.map((o, j) => (j === i ? next : o)));
  }
  function setItems(items: PlanItem[]) {
    setOpt({ ...opt, items });
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2">
        <div>
          <span className="font-medium">{title}</span>
          {time && <span className="ml-2 text-xs text-muted-foreground">{time}</span>}
        </div>
        <span className={`text-xs tabular-nums ${targetKcal && Math.abs(avg.kcal - targetKcal) > targetKcal * 0.15 ? "text-amber-700" : "text-muted-foreground"}`}>
          {avg.kcal} kcal{targetKcal ? ` / meta ≈${targetKcal}` : ""} · P {avg.proteinG} · C {avg.carbsG} · G {avg.fatG}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
        {options.map((o, j) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setActive(j)}
            className={`rounded-md px-2 py-1 text-xs ${j === i ? "bg-foreground text-background" : "bg-muted"}`}
          >
            {o.label || `Opción ${j + 1}`} · {optionTotals(o).kcal}
          </button>
        ))}
        {options.length < MAX_OPTIONS && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange([...options, emptyOption(`Opción ${options.length + 1}`)]);
                setActive(options.length);
              }}
            >
              + opción
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange([...options, { ...opt, id: newOptionId(), label: `Opción ${options.length + 1}`, items: opt.items.map((x) => ({ ...x })) }]);
                setActive(options.length);
              }}
            >
              duplicar
            </Button>
          </>
        )}
        {options.length > 1 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-red-700"
            onClick={() => {
              onChange(options.filter((_, j) => j !== i));
              setActive(0);
            }}
          >
            quitar opción
          </Button>
        )}
      </div>

      <div className="space-y-2 p-3">
        {options.length > 1 && (
          <Input
            className="h-8 w-48 text-sm"
            value={opt.label}
            onChange={(e) => setOpt({ ...opt, label: e.target.value })}
            placeholder="Nombre de la opción"
          />
        )}
        {opt.items.length > 0 && (
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {opt.items.map((it, k) => (
                <tr key={k}>
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{it.name}</span>
                    {it.recipeId && <span className="ml-1 text-[10px] text-muted-foreground">receta</span>}
                  </td>
                  <td className="py-1.5 pr-2 w-44">
                    <div className="flex items-center gap-1">
                      <AmountInput
                        value={(it.recipeId ? it.servings : it.grams) ?? 0}
                        onCommit={(v) => setItems(opt.items.map((x, j) => (j === k ? setItemAmount(x, v) : x)))}
                      />
                      <span className="text-xs text-muted-foreground">{it.recipeId ? "porc." : "g"}</span>
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 w-32">
                    <Input
                      className="h-8 text-xs"
                      placeholder="medida casera"
                      value={it.portionLabel ?? ""}
                      onChange={(e) => setItems(opt.items.map((x, j) => (j === k ? { ...x, portionLabel: e.target.value || null } : x)))}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-right text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                    <span className="font-medium text-foreground">{it.kcal}</span> kcal · P {it.proteinG} · C {it.carbsG} · G {it.fatG}
                  </td>
                  <td className="py-1.5 w-8 text-right">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-red-700"
                      onClick={() => setItems(opt.items.filter((_, j) => j !== k))}
                      aria-label="Quitar"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ItemAdder onAdd={(item) => setItems([...opt.items, item])} />
        <textarea
          rows={1}
          value={opt.notes ?? ""}
          onChange={(e) => setOpt({ ...opt, notes: e.target.value || null })}
          placeholder="Notas para el socio (preparación, sustituciones…)"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}

/**
 * Amount field that commits on blur/Enter. Committing on every keystroke would
 * rescale through intermediate values ("1" → "15" → "150") and compound the
 * rounding of the nutrient snapshot.
 */
export function AmountInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(",", "."));
    if (v > 0 && v !== value) onCommit(v);
    setDraft(null);
  };
  return (
    <Input
      className="h-8 w-20"
      inputMode="decimal"
      value={draft ?? String(value || "")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
