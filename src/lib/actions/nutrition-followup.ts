"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { todayDateUtc } from "@/lib/timezone";
import { parsePlanContent, enabledMeals } from "@/lib/nutrition/plan-schema";
import type { AdherenceLevel } from "@/generated/prisma/client";

async function requireNutrition() {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Sin permisos");
  return user;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type FollowUpRow = {
  memberId: string;
  name: string;
  planTitle: string | null;
  planKind: "MENU" | "EXCHANGES" | "LINK" | null;
  week: (AdherenceLevel | null)[]; // oldest → today
  unread: number;
  lastMessageAt: Date | null;
  nextAppointment: Date | null;
};

/**
 * Socios the nutritionist follows: everyone with a published plan or a
 * message. Shows the last 7 days of semáforo and unread messages so she can
 * see at a glance who is struggling or waiting for an answer.
 */
export async function listNutritionFollowUp(): Promise<FollowUpRow[]> {
  await requireNutrition();
  const today = todayDateUtc();
  const from = new Date(today.getTime() - 6 * DAY_MS);

  const [plans, msgMembers] = await Promise.all([
    prisma.mealPlan.findMany({
      where: { active: true, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      select: { memberId: true, title: true, content: true, externalUrl: true },
    }),
    prisma.nutritionMessage.groupBy({ by: ["memberId"], _max: { createdAt: true } }),
  ]);
  const memberIds = [...new Set([...plans.map((p) => p.memberId), ...msgMembers.map((m) => m.memberId)])];
  if (memberIds.length === 0) return [];

  const [members, logs, unread, appts] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, firstName: true, lastName: true } }),
    prisma.mealLog.findMany({
      where: { memberId: { in: memberIds }, date: { gte: from, lte: today } },
      select: { memberId: true, date: true, adherence: true },
    }),
    prisma.nutritionMessage.groupBy({
      by: ["memberId"],
      where: { memberId: { in: memberIds }, author: "MEMBER", readAt: null },
      _count: { _all: true },
    }),
    prisma.nutritionAppointment.groupBy({
      by: ["memberId"],
      where: { memberId: { in: memberIds }, status: "SCHEDULED", startsAt: { gte: new Date() } },
      _min: { startsAt: true },
    }),
  ]);

  const planBy = new Map<string, (typeof plans)[number]>();
  for (const p of plans) if (!planBy.has(p.memberId)) planBy.set(p.memberId, p);
  const lastMsg = new Map(msgMembers.map((m) => [m.memberId, m._max.createdAt]));
  const unreadBy = new Map(unread.map((u) => [u.memberId, u._count._all]));
  const apptBy = new Map(appts.map((a) => [a.memberId, a._min.startsAt]));
  const logBy = new Map<string, Map<number, AdherenceLevel | null>>();
  for (const l of logs) {
    const m = logBy.get(l.memberId) ?? new Map();
    m.set(l.date.getTime(), l.adherence);
    logBy.set(l.memberId, m);
  }

  return members
    .map((m) => {
      const p = planBy.get(m.id);
      const kind: FollowUpRow["planKind"] = p ? parsePlanContent(p.content)?.kind ?? (p.externalUrl ? "LINK" : null) : null;
      return {
        memberId: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        planTitle: p?.title ?? null,
        planKind: kind,
        week: Array.from({ length: 7 }, (_, i) => logBy.get(m.id)?.get(from.getTime() + i * DAY_MS) ?? null),
        unread: unreadBy.get(m.id) ?? 0,
        lastMessageAt: lastMsg.get(m.id) ?? null,
        nextAppointment: apptBy.get(m.id) ?? null,
      };
    })
    .sort((a, b) => b.unread - a.unread || (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0) || a.name.localeCompare(b.name, "es"));
}

/** One socio's nutrition follow-up: plan, last 14 days of meal checks, message thread. */
export async function getMemberNutritionFollowUp(memberId: string) {
  await requireNutrition();
  const today = todayDateUtc();
  const from = new Date(today.getTime() - 13 * DAY_MS);
  const [member, plan, logs, messages, target] = await Promise.all([
    prisma.member.findUnique({ where: { id: memberId }, select: { id: true, firstName: true, lastName: true, sede: true } }),
    prisma.mealPlan.findFirst({
      where: { memberId, active: true, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      select: { id: true, title: true, content: true, publishedAt: true, schemaVersion: true },
    }),
    prisma.mealLog.findMany({
      where: { memberId, date: { gte: from, lte: today } },
      orderBy: { date: "asc" },
      select: { date: true, adherence: true, freeText: true, entries: { select: { mealKey: true, ate: true, optionLabel: true, freeText: true } } },
    }),
    prisma.nutritionMessage.findMany({ where: { memberId }, orderBy: { createdAt: "asc" }, take: 300 }),
    prisma.nutritionTarget.findUnique({ where: { memberId }, select: { kcal: true, proteinG: true, source: true } }),
  ]);
  const diaryFrom = new Date(today.getTime() - 6 * DAY_MS);
  const diary = await prisma.foodLogEntry.findMany({
    where: { memberId, active: true, date: { gte: diaryFrom, lte: today } },
    orderBy: [{ date: "desc" }, { createdAt: "asc" }],
    select: { date: true, mealKey: true, name: true, grams: true, servings: true, portionLabel: true, kcal: true, proteinG: true, carbsG: true, fatG: true },
  });
  if (!member) return null;
  const content = parsePlanContent(plan?.content);
  return {
    member,
    plan: plan ? { id: plan.id, title: plan.title, publishedAt: plan.publishedAt, structured: plan.schemaVersion === 2 } : null,
    mealKeys: content ? enabledMeals(content) : [],
    mealLabels: Object.fromEntries((content?.meals ?? []).map((m) => [m.key, m.label])),
    days: Array.from({ length: 14 }, (_, i) => {
      const d = new Date(from.getTime() + i * DAY_MS);
      const log = logs.find((l) => l.date.getTime() === d.getTime());
      return { date: d, adherence: log?.adherence ?? null, note: log?.freeText ?? null, entries: log?.entries ?? [] };
    }),
    messages,
    target,
    // Food diary, last 7 days (newest first), grouped by day.
    diary: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today.getTime() - i * DAY_MS);
      const items = diary.filter((e) => e.date.getTime() === d.getTime());
      const sum = (k: "kcal" | "proteinG" | "carbsG" | "fatG") => Math.round(items.reduce((a, e) => a + e[k], 0));
      return { date: d, items, kcal: sum("kcal"), proteinG: sum("proteinG"), carbsG: sum("carbsG"), fatG: sum("fatG") };
    }),
  };
}
