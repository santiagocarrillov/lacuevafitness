import { prisma } from "@/lib/prisma";
import { parsePlanContent } from "@/lib/nutrition/plan-schema";
import { EXCHANGE_GROUPS, type ExchangeGroup } from "@/lib/nutrition/exchanges";
import { parsePortions } from "@/lib/nutrition/nutrients";

/**
 * The socio's current plan as they may see it: only the PUBLISHED content
 * (never the draft). Caller passes the session member's id.
 */
export async function getCurrentPlanForMember(memberId: string) {
  const plan = await prisma.mealPlan.findFirst({
    where: { memberId, active: true, visibleToMember: true, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, calorieTarget: true, externalUrl: true, publishedAt: true, content: true },
  });
  if (!plan) return null;
  return { ...plan, content: parsePlanContent(plan.content) };
}

/** Today's per-meal checks + the day's semáforo. */
export async function getDayChecks(memberId: string, dateUtc: Date) {
  const log = await prisma.mealLog.findUnique({
    where: { memberId_date: { memberId, date: dateUtc } },
    select: {
      adherence: true,
      freeText: true,
      entries: { select: { mealKey: true, optionId: true, optionLabel: true, ate: true, freeText: true } },
    },
  });
  return { adherence: log?.adherence ?? null, freeText: log?.freeText ?? null, entries: log?.entries ?? [] };
}

export type Equivalent = { id: string; name: string; grams: number; isLiquid: boolean; portion: string | null };

/**
 * "Lista de equivalencias": verified foods of each exchange group with the
 * grams that make one exchange, plus a household measure when one is close.
 */
export async function getExchangeEquivalents(groups: ExchangeGroup[], perGroup = 25) {
  const wanted = groups.filter((g) => (EXCHANGE_GROUPS as readonly string[]).includes(g) && g !== "FREE");
  if (wanted.length === 0) return {} as Partial<Record<ExchangeGroup, Equivalent[]>>;
  const foods = await prisma.food.findMany({
    where: { active: true, verifiedAt: { not: null }, exchangeGroup: { in: wanted }, exchangeGrams: { not: null } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, exchangeGroup: true, exchangeGrams: true, isLiquid: true, portions: true },
  });
  const out: Partial<Record<ExchangeGroup, Equivalent[]>> = {};
  for (const f of foods) {
    const g = f.exchangeGroup as ExchangeGroup;
    const list = (out[g] ??= []);
    if (list.length >= perGroup) continue;
    const grams = f.exchangeGrams!;
    // Express it in a household measure when one is within ±25%.
    const p = parsePortions(f.portions).find((x) => Math.abs(x.grams - grams) / grams <= 0.25);
    list.push({ id: f.id, name: f.name, grams, isLiquid: f.isLiquid, portion: p ? p.label : null });
  }
  return out;
}
