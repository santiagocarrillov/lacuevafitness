"use client";

import { useRef, useState } from "react";
import { useDebouncedSearch } from "@/components/nutrition/use-debounced-search";
import { Input } from "@/components/ui/input";
import { FoodPicker } from "@/components/nutrition/food-picker";
import { searchRecipesForPlan } from "@/lib/actions/meal-plans";
import { scaleFood } from "@/lib/nutrition/nutrients";
import type { PlanItem } from "@/lib/nutrition/plan-schema";
import type { FoodRow } from "@/lib/actions/foods";

type RecipeHit = Awaited<ReturnType<typeof searchRecipesForPlan>>[number];

export function foodToItem(f: FoodRow, grams?: number, portionLabel?: string | null): PlanItem {
  const g = grams ?? f.portions[0]?.grams ?? 100;
  const m = scaleFood(f, g);
  return {
    foodId: f.id,
    recipeId: null,
    name: f.brand ? `${f.name} (${f.brand})` : f.name,
    grams: g,
    servings: null,
    portionLabel: portionLabel ?? (grams === undefined ? f.portions[0]?.label ?? null : null),
    kcal: m.kcal,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
  };
}

function recipeToItem(r: RecipeHit): PlanItem {
  return {
    foodId: null,
    recipeId: r.id,
    name: r.title,
    grams: null,
    servings: 1,
    portionLabel: "1 porción",
    kcal: Math.round(r.kcal),
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
  };
}

/** Rescales an item's snapshot to a new amount (grams or servings), linearly. */
export function setItemAmount(i: PlanItem, amount: number): PlanItem {
  const prev = (i.recipeId ? i.servings : i.grams) ?? 0;
  if (!(amount > 0) || !(prev > 0)) return i;
  const f = amount / prev;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ...i,
    ...(i.recipeId ? { servings: amount } : { grams: amount }),
    portionLabel: null,
    kcal: Math.round(i.kcal * f),
    proteinG: r1(i.proteinG * f),
    carbsG: r1(i.carbsG * f),
    fatG: r1(i.fatG * f),
  };
}

function RecipePicker({ onPick }: { onPick: (r: RecipeHit) => void }) {
  const [q, setQ] = useState("");
  const { results } = useDebouncedSearch(q, searchRecipesForPlan);
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={boxRef} className="relative">
      <Input placeholder="Buscar receta…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-input bg-popover shadow-md divide-y">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(r);
                  setQ("");
                }}
              >
                <span className="font-medium">{r.title}</span>
                {r.status !== "PUBLISHED" && <span className="ml-1 text-[10px] text-amber-700">(no publicada)</span>}
                <span className="block text-xs text-muted-foreground">
                  {Math.round(r.kcal)} kcal · P {r.proteinG} · C {r.carbsG} · G {r.fatG} por porción
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "+ alimento / + receta" row under a meal option. */
export function ItemAdder({ onAdd }: { onAdd: (item: PlanItem) => void }) {
  const [mode, setMode] = useState<"food" | "recipe">("food");
  return (
    <div className="flex gap-2 items-start">
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as "food" | "recipe")}
        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
        aria-label="Tipo de ítem"
      >
        <option value="food">Alimento</option>
        <option value="recipe">Receta</option>
      </select>
      <div className="flex-1">
        {mode === "food" ? (
          <FoodPicker placeholder="+ Agregar alimento…" onPick={(f) => onAdd(foodToItem(f))} />
        ) : (
          <RecipePicker onPick={(r) => onAdd(recipeToItem(r))} />
        )}
      </div>
    </div>
  );
}
