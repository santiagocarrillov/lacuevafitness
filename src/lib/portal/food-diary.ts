import { prisma } from "@/lib/prisma";
import { resolveDailyTarget, type DailyTarget } from "@/lib/nutrition/target";
import { computeDayBudget, type DayBudget } from "@/lib/nutrition/budget";
import { gramsForKcal, suggestForMeal, type Candidate } from "@/lib/nutrition/suggest";
import { enabledMeals, menuDayFor, optionTotals, parsePlanContent } from "@/lib/nutrition/plan-schema";
import { isMealKey, MEAL_KEYS, type MealKey } from "@/lib/nutrition/meals";
import { isoWeekday } from "@/lib/nutrition/adherence";
import { scaleFood } from "@/lib/nutrition/nutrients";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DiaryEntryVm = {
  id: string;
  mealKey: MealKey;
  name: string;
  amount: string;
  grams: number | null;
  servings: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  canSwap: boolean;
  isRecipe: boolean;
};

export type PlanOptionVm = { id: string; mealKey: MealKey; label: string; kcal: number; items: string[] };

function amountLabel(e: { grams: number | null; servings: number | null; portionLabel: string | null }) {
  if (e.servings) return `${e.servings} ${e.servings === 1 ? "porción" : "porciones"}`;
  if (e.grams) return e.portionLabel ? `${e.portionLabel} (${Math.round(e.grams)} g)` : `${Math.round(e.grams)} g`;
  return e.portionLabel ?? "";
}

/**
 * Everything the diary screen needs for one day of one socio (the caller
 * passes the session member). Suggestions are only computed for today.
 */
export async function getDiaryDay(memberId: string, dateStr: string, isToday: boolean) {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  const yesterday = new Date(date.getTime() - DAY_MS);
  const [entries, yEntries, plan, stored] = await Promise.all([
    prisma.foodLogEntry.findMany({
      where: { memberId, date, active: true },
      orderBy: { createdAt: "asc" },
      include: { food: { select: { exchangeGroup: true } } },
    }),
    prisma.foodLogEntry.groupBy({ by: ["mealKey"], where: { memberId, date: yesterday, active: true }, _sum: { kcal: true } }),
    prisma.mealPlan.findFirst({
      where: { memberId, active: true, visibleToMember: true, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      select: { content: true },
    }),
    prisma.nutritionTarget.findUnique({ where: { memberId } }),
  ]);
  const content = parsePlanContent(plan?.content);
  const target: DailyTarget | null = resolveDailyTarget(
    content ? { targets: content.targets, meals: enabledMeals(content) } : null,
    stored,
  );
  const meals: MealKey[] = target?.meals ?? [...MEAL_KEYS];

  const vm: DiaryEntryVm[] = entries
    .filter((e) => isMealKey(e.mealKey))
    .map((e) => ({
      id: e.id,
      mealKey: e.mealKey as MealKey,
      name: e.name,
      amount: amountLabel(e),
      grams: e.grams,
      servings: e.servings,
      kcal: Math.round(e.kcal),
      proteinG: e.proteinG,
      carbsG: e.carbsG,
      fatG: e.fatG,
      canSwap: Boolean(e.food?.exchangeGroup && e.food.exchangeGroup !== "FREE"),
      isRecipe: Boolean(e.recipeId),
    }));
  // Entries logged under a meal the plan doesn't have still show (e.g. a snack).
  const shownMeals = MEAL_KEYS.filter((k) => meals.includes(k) || vm.some((e) => e.mealKey === k));

  const totals = vm.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, proteinG: a.proteinG + e.proteinG, carbsG: a.carbsG + e.carbsG, fatG: a.fatG + e.fatG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  const consumedByMeal: Partial<Record<MealKey, number>> = {};
  const hasEntries: Partial<Record<MealKey, boolean>> = {};
  for (const e of vm) {
    consumedByMeal[e.mealKey] = (consumedByMeal[e.mealKey] ?? 0) + e.kcal;
    hasEntries[e.mealKey] = true;
  }
  const budget: DayBudget | null = target
    ? computeDayBudget({ target: target.kcal, split: target.mealSplit, meals: shownMeals, consumedByMeal, hasEntries })
    : null;

  // Today's plan options (MENU) — for "Mi plan" in the add sheet and as suggestions.
  const planOptions: PlanOptionVm[] = [];
  if (content?.kind === "MENU") {
    const day = menuDayFor(content, isoWeekday(dateStr));
    for (const m of day?.meals ?? []) {
      for (const o of m.options.filter((x) => x.items.length > 0)) {
        planOptions.push({ id: o.id, mealKey: m.key, label: o.label || "Opción", kcal: optionTotals(o).kcal, items: o.items.map((i) => i.name) });
      }
    }
  }

  let suggestions: { mealKey: MealKey; budget: number; items: Candidate[] } | null = null;
  const next = budget?.nextOpenMeal ?? null;
  if (isToday && target && budget && next) {
    const slot = budget.meals.find((m) => m.key === next)?.suggested ?? 0;
    const proteinGap = Math.max(0, target.proteinG - totals.proteinG);
    const [recipes, freq] = await Promise.all([
      prisma.recipe.findMany({
        where: { active: true, status: "PUBLISHED", mealKeys: { has: next } },
        select: { id: true, title: true, kcal: true, proteinG: true, carbsG: true, fatG: true },
        take: 40,
      }),
      prisma.foodLogEntry.groupBy({
        by: ["foodId"],
        where: { memberId, active: true, foodId: { not: null }, mealKey: next, createdAt: { gte: new Date(Date.now() - 60 * DAY_MS) } },
        _count: { _all: true },
        orderBy: { _count: { foodId: "desc" } },
        take: 10,
      }),
    ]);
    const freqFoods = await prisma.food.findMany({
      where: { id: { in: freq.map((f) => f.foodId!).filter(Boolean) }, active: true },
      select: { id: true, name: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
    });
    const candidates: Candidate[] = [
      ...planOptions
        .filter((o) => o.mealKey === next)
        .map((o) => {
          const opt = menuDayFor(content!, isoWeekday(dateStr))!.meals.find((m) => m.key === next)!.options.find((x) => x.id === o.id)!;
          const t = optionTotals(opt);
          return { id: `p${o.id}`, kind: "plan" as const, name: `Tu plan: ${o.label}`, refId: o.id, ...t };
        }),
      ...recipes.map((r) => ({ id: `r${r.id}`, kind: "recipe" as const, name: r.title, refId: r.id, servings: 1, kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG })),
      ...freqFoods.flatMap((f) => {
        const g = gramsForKcal(f.kcal, slot * 0.8);
        if (!g) return [];
        return [{ id: `f${f.id}`, kind: "food" as const, name: f.name, refId: f.id, grams: g, ...scaleFood(f, g) }];
      }),
    ];
    suggestions = { mealKey: next, budget: slot, items: suggestForMeal(candidates, slot, proteinGap) };
  }

  return {
    date: dateStr,
    entries: vm,
    meals: shownMeals,
    totals: {
      kcal: Math.round(totals.kcal),
      proteinG: Math.round(totals.proteinG),
      carbsG: Math.round(totals.carbsG),
      fatG: Math.round(totals.fatG),
    },
    target,
    budget,
    planOptions,
    suggestions,
    yesterdayMeals: Object.fromEntries(yEntries.map((y) => [y.mealKey, Math.round(y._sum.kcal ?? 0)])) as Partial<Record<MealKey, number>>,
    planIsExchanges: content?.kind === "EXCHANGES",
  };
}

export type DiaryDay = Awaited<ReturnType<typeof getDiaryDay>>;

/** Daily totals over the last `days` days (for Progreso), oldest first. */
export async function getDiaryHistory(memberId: string, todayUtc: Date, days = 30) {
  const from = new Date(todayUtc.getTime() - (days - 1) * DAY_MS);
  const [sums, logs, weights] = await Promise.all([
    prisma.foodLogEntry.groupBy({
      by: ["date"],
      where: { memberId, active: true, date: { gte: from, lte: todayUtc } },
      _sum: { kcal: true, proteinG: true, carbsG: true, fatG: true },
    }),
    prisma.mealLog.findMany({ where: { memberId, date: { gte: from, lte: todayUtc } }, select: { date: true, adherence: true } }),
    prisma.bodyComposition.findMany({
      where: { memberId, measuredAt: { gte: from }, weightKg: { not: null } },
      orderBy: { measuredAt: "asc" },
      select: { measuredAt: true, weightKg: true },
    }),
  ]);
  const byDate = new Map(sums.map((s) => [s.date.getTime(), s._sum]));
  const adBy = new Map(logs.map((l) => [l.date.getTime(), l.adherence]));
  return {
    days: Array.from({ length: days }, (_, i) => {
      const d = new Date(from.getTime() + i * DAY_MS);
      const s = byDate.get(d.getTime());
      return {
        date: d.toISOString().slice(0, 10),
        kcal: Math.round(s?.kcal ?? 0),
        proteinG: Math.round(s?.proteinG ?? 0),
        carbsG: Math.round(s?.carbsG ?? 0),
        fatG: Math.round(s?.fatG ?? 0),
        adherence: adBy.get(d.getTime()) ?? null,
      };
    }),
    weights: weights.map((w) => ({ date: w.measuredAt.toISOString().slice(0, 10), weight: w.weightKg! })),
  };
}
