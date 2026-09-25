// Structured meal-plan content (MealPlan.content / draftContent / MealPlanTemplate.content),
// schemaVersion 2. Single source of truth for the editor, the portal renderer,
// adherence math and rescaling. Pure — no Prisma.
//
// Two formats:
//  - MENU: concrete meals. Either one menu for every day ("ALL") or one per
//    weekday (1 = lunes … 7 = domingo). Each meal offers 1–3 options.
//  - EXCHANGES: "sistema de intercambios" — servings per food group per meal;
//    the socio picks foods of each group in the right amount.
// "Plantillas por calorías" are MealPlanTemplates holding either format.

import { z } from "zod";
import { EXCHANGE_GROUPS, type ExchangeGroup } from "./exchanges";
import { MEAL_KEYS, MEAL_LABEL, type MealKey } from "./meals";

const r1 = (n: number) => Math.round(n * 10) / 10;

export const planItemSchema = z.object({
  foodId: z.string().nullish(),
  recipeId: z.string().nullish(),
  name: z.string().min(1),
  grams: z.number().positive().nullish(), // foods
  servings: z.number().positive().nullish(), // recipes
  portionLabel: z.string().nullish(),
  // Snapshot of the item's nutrients at the chosen amount — the plan never
  // changes because someone later edits the food.
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const planOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  notes: z.string().nullish(),
  items: z.array(planItemSchema),
});
export type PlanOption = z.infer<typeof planOptionSchema>;

const mealKeySchema = z.enum(MEAL_KEYS);
const exchangeGroupSchema = z.enum(EXCHANGE_GROUPS);

export const planMealSlotSchema = z.object({
  key: mealKeySchema,
  label: z.string(),
  time: z.string().nullish(), // "07:00"
});
export type PlanMealSlot = z.infer<typeof planMealSlotSchema>;

export const menuDaySchema = z.object({
  day: z.union([z.literal("ALL"), z.number().int().min(1).max(7)]),
  meals: z.array(z.object({ key: mealKeySchema, options: z.array(planOptionSchema) })),
});
export type MenuDay = z.infer<typeof menuDaySchema>;

export const exchangeMealSchema = z.object({
  key: mealKeySchema,
  groups: z.partialRecord(exchangeGroupSchema, z.number().min(0).max(20)),
  notes: z.string().nullish(),
});
export type ExchangeMeal = z.infer<typeof exchangeMealSchema>;

export const targetsSchema = z.object({
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
});
export type PlanTargets = z.infer<typeof targetsSchema>;

export const planContentSchema = z.object({
  schemaVersion: z.literal(2),
  kind: z.enum(["MENU", "EXCHANGES"]),
  targets: targetsSchema,
  meals: z.array(planMealSlotSchema).min(1),
  notes: z.string().nullish(),
  recommendations: z.array(z.string()).default([]),
  days: z.array(menuDaySchema).default([]),
  exchanges: z.array(exchangeMealSchema).default([]),
});
export type PlanContent = z.infer<typeof planContentSchema>;
export type PlanKind = PlanContent["kind"];

export const PLAN_KIND_LABEL: Record<PlanKind, string> = {
  MENU: "Menú",
  EXCHANGES: "Intercambios",
};

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

/**
 * Nutrients of one exchange of each group (standard Latin-American exchange
 * lists; protein = medium-fat meats, dairy = semi-skimmed).
 */
export const EXCHANGE_MACROS: Record<ExchangeGroup, { kcal: number; proteinG: number; carbsG: number; fatG: number }> = {
  PROTEIN: { kcal: 75, proteinG: 7, carbsG: 0, fatG: 5 },
  STARCH: { kcal: 80, proteinG: 2, carbsG: 15, fatG: 0.5 },
  FRUIT: { kcal: 60, proteinG: 0, carbsG: 15, fatG: 0 },
  VEGETABLE: { kcal: 25, proteinG: 2, carbsG: 5, fatG: 0 },
  DAIRY: { kcal: 120, proteinG: 8, carbsG: 12, fatG: 5 },
  FAT: { kcal: 45, proteinG: 0, carbsG: 0, fatG: 5 },
  SUGAR: { kcal: 40, proteinG: 0, carbsG: 10, fatG: 0 },
  FREE: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
};

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number };
const ZERO: Totals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

function add(a: Totals, b: Totals, f = 1): Totals {
  return {
    kcal: a.kcal + b.kcal * f,
    proteinG: a.proteinG + b.proteinG * f,
    carbsG: a.carbsG + b.carbsG * f,
    fatG: a.fatG + b.fatG * f,
  };
}

function round(t: Totals): Totals {
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) };
}

export function optionTotals(o: PlanOption): Totals {
  return round(o.items.reduce((acc, i) => add(acc, i), ZERO));
}

/** A meal with several options counts as the average of its options. */
export function mealOptionsTotals(options: PlanOption[]): Totals {
  const filled = options.filter((o) => o.items.length > 0);
  if (filled.length === 0) return ZERO;
  const sum = filled.reduce((acc, o) => add(acc, optionTotals(o)), ZERO);
  return round({
    kcal: sum.kcal / filled.length,
    proteinG: sum.proteinG / filled.length,
    carbsG: sum.carbsG / filled.length,
    fatG: sum.fatG / filled.length,
  });
}

export function exchangeMealTotals(m: ExchangeMeal): Totals {
  let t = ZERO;
  for (const g of EXCHANGE_GROUPS) t = add(t, EXCHANGE_MACROS[g], m.groups[g] ?? 0);
  return round(t);
}

/** Enabled meal keys in canonical order. */
export function enabledMeals(c: PlanContent): MealKey[] {
  const set = new Set(c.meals.map((m) => m.key));
  return MEAL_KEYS.filter((k) => set.has(k));
}

/** The MENU day that applies to ISO weekday `weekday` (1–7): its own, else "ALL", else the first. */
export function menuDayFor(c: PlanContent, weekday: number): MenuDay | null {
  return c.days.find((d) => d.day === weekday) ?? c.days.find((d) => d.day === "ALL") ?? c.days[0] ?? null;
}

/** Per-meal and daily totals. For MENU pass the day to evaluate (default: first day). */
export function planDayTotals(c: PlanContent, day?: MenuDay | null): { meals: Partial<Record<MealKey, Totals>>; total: Totals } {
  const meals: Partial<Record<MealKey, Totals>> = {};
  const keys = enabledMeals(c);
  if (c.kind === "EXCHANGES") {
    for (const k of keys) {
      const m = c.exchanges.find((e) => e.key === k);
      meals[k] = m ? exchangeMealTotals(m) : ZERO;
    }
  } else {
    const d = day ?? c.days[0];
    for (const k of keys) {
      const m = d?.meals.find((x) => x.key === k);
      meals[k] = m ? mealOptionsTotals(m.options) : ZERO;
    }
  }
  const total = round(keys.reduce((acc, k) => add(acc, meals[k] ?? ZERO), ZERO));
  return { meals, total };
}

/** Average daily totals across the week (MENU with per-day menus) — what the editor compares to targets. */
export function planAverageTotals(c: PlanContent): Totals {
  if (c.kind === "EXCHANGES" || c.days.length <= 1) return planDayTotals(c).total;
  const sum = c.days.reduce((acc, d) => add(acc, planDayTotals(c, d).total), ZERO);
  const n = c.days.length;
  return round({ kcal: sum.kcal / n, proteinG: sum.proteinG / n, carbsG: sum.carbsG / n, fatG: sum.fatG / n });
}

let idSeq = 0;
export function newOptionId(): string {
  idSeq += 1;
  return `o${Date.now().toString(36)}${idSeq}`;
}

export function emptyOption(label = "Opción 1"): PlanOption {
  return { id: newOptionId(), label, notes: null, items: [] };
}

const DEFAULT_TIMES: Record<MealKey, string> = {
  breakfast: "07:00",
  snack_am: "10:00",
  lunch: "13:00",
  snack_pm: "16:30",
  dinner: "19:30",
};

/** Default macro split for a kcal level (30% P / 45% C / 25% G). */
export function defaultTargets(kcal: number): PlanTargets {
  return {
    kcal,
    proteinG: Math.round((kcal * 0.3) / 4),
    carbsG: Math.round((kcal * 0.45) / 4),
    fatG: Math.round((kcal * 0.25) / 9),
  };
}

export function emptyPlanContent(kind: PlanKind, targets: PlanTargets): PlanContent {
  const meals = MEAL_KEYS.map((key) => ({ key, label: MEAL_LABEL[key], time: DEFAULT_TIMES[key] }));
  return {
    schemaVersion: 2,
    kind,
    targets,
    meals,
    notes: null,
    recommendations: [],
    days: kind === "MENU" ? [{ day: "ALL", meals: MEAL_KEYS.map((key) => ({ key, options: [emptyOption()] })) }] : [],
    exchanges: kind === "EXCHANGES" ? MEAL_KEYS.map((key) => ({ key, groups: {}, notes: null })) : [],
  };
}

/** Parses stored JSON; null when absent/legacy/invalid (callers fall back to the link-only plan). */
export function parsePlanContent(raw: unknown): PlanContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = planContentSchema.safeParse(raw);
  return r.success ? r.data : null;
}

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/**
 * Rescales a plan to a new daily kcal: MENU scales every item's grams/servings
 * and nutrients by the same factor (grams rounded to 5 g, servings to ¼);
 * EXCHANGES scales the counts (to ½ exchange, FREE untouched). Targets move
 * to the new kcal keeping their proportions.
 */
export function scalePlan(c: PlanContent, targetKcal: number): PlanContent {
  const current = planAverageTotals(c).kcal || c.targets.kcal;
  if (!(current > 0) || !(targetKcal > 0)) return c;
  const f = targetKcal / current;
  const tf = c.targets.kcal > 0 ? targetKcal / c.targets.kcal : f;

  const scaleItem = (i: PlanItem): PlanItem => {
    const grams = i.grams ? roundTo(i.grams * f, 5) : i.grams;
    const servings = i.servings ? roundTo(i.servings * f, 0.25) : i.servings;
    // Nutrients follow the rounded amount, not the raw factor.
    const actual = i.grams && grams ? grams / i.grams : i.servings && servings ? servings / i.servings : f;
    return {
      ...i,
      grams,
      servings,
      portionLabel: actual === 1 ? i.portionLabel : null,
      kcal: Math.round(i.kcal * actual),
      proteinG: r1(i.proteinG * actual),
      carbsG: r1(i.carbsG * actual),
      fatG: r1(i.fatG * actual),
    };
  };

  return {
    ...c,
    targets: {
      kcal: Math.round(targetKcal),
      proteinG: Math.round(c.targets.proteinG * tf),
      carbsG: Math.round(c.targets.carbsG * tf),
      fatG: Math.round(c.targets.fatG * tf),
    },
    days: c.days.map((d) => ({
      ...d,
      meals: d.meals.map((m) => ({ ...m, options: m.options.map((o) => ({ ...o, items: o.items.map(scaleItem) })) })),
    })),
    exchanges: c.exchanges.map((m) => ({
      ...m,
      groups: Object.fromEntries(
        Object.entries(m.groups).map(([g, n]) => [g, g === "FREE" ? n : Math.round((n ?? 0) * f * 2) / 2]),
      ) as ExchangeMeal["groups"],
    })),
  };
}
