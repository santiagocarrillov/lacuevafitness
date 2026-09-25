// Server → client view model for the socio's plan (plain JSON, no Dates).
import { EXCHANGE_LABEL, type ExchangeGroup } from "@/lib/nutrition/exchanges";
import {
  WEEKDAY_LABEL,
  enabledMeals,
  exchangeMealTotals,
  mealOptionsTotals,
  optionTotals,
  planDayTotals,
  type MenuDay,
  type PlanContent,
  type PlanItem,
} from "@/lib/nutrition/plan-schema";
import { MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";

export type VmItem = { name: string; amount: string; kcal: number };
export type VmOption = { id: string; label: string; notes: string | null; items: VmItem[]; kcal: number; proteinG: number };
export type VmGroup = { group: ExchangeGroup; label: string; count: number };
export type VmMeal = {
  key: MealKey;
  label: string;
  time: string | null;
  kcal: number;
  options: VmOption[]; // MENU
  groups: VmGroup[]; // EXCHANGES
  notes: string | null;
};
export type VmDay = { day: MenuDay["day"] | null; label: string; meals: VmMeal[]; kcal: number };

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

export function itemAmount(i: PlanItem): string {
  if (i.recipeId) {
    const s = i.servings ?? 1;
    return i.portionLabel && s === 1 ? i.portionLabel : `${fmtNum(s)} ${s === 1 ? "porción" : "porciones"}`;
  }
  const g = i.grams ? `${Math.round(i.grams)} g` : "";
  return i.portionLabel ? `${i.portionLabel}${g ? ` (${g})` : ""}` : g;
}

export function buildDay(c: PlanContent, day: MenuDay | null): VmDay {
  const keys = enabledMeals(c);
  const meals: VmMeal[] = keys.map((key) => {
    const slot = c.meals.find((m) => m.key === key);
    const base = { key, label: slot?.label || MEAL_LABEL[key], time: slot?.time ?? null };
    if (c.kind === "EXCHANGES") {
      const ex = c.exchanges.find((e) => e.key === key);
      const groups = Object.entries(ex?.groups ?? {})
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([g, n]) => ({ group: g as ExchangeGroup, label: EXCHANGE_LABEL[g as ExchangeGroup], count: n as number }));
      return { ...base, kcal: ex ? exchangeMealTotals(ex).kcal : 0, options: [], groups, notes: ex?.notes ?? null };
    }
    const m = day?.meals.find((x) => x.key === key);
    const options = (m?.options ?? [])
      .filter((o) => o.items.length > 0)
      .map((o, i) => {
        const t = optionTotals(o);
        return {
          id: o.id,
          label: o.label || (m!.options.length > 1 ? `Opción ${i + 1}` : ""),
          notes: o.notes ?? null,
          items: o.items.map((it) => ({ name: it.name, amount: itemAmount(it), kcal: it.kcal })),
          kcal: t.kcal,
          proteinG: t.proteinG,
        };
      });
    return { ...base, kcal: m ? mealOptionsTotals(m.options).kcal : 0, options, groups: [], notes: null };
  });
  const label = day && typeof day.day === "number" ? WEEKDAY_LABEL[day.day] : "Todos los días";
  return { day: day?.day ?? null, label, meals, kcal: planDayTotals(c, day).total.kcal };
}
