"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { ecuadorDateString, todayDateUtc } from "@/lib/timezone";
import { adherenceFromChecks, isoWeekday } from "@/lib/nutrition/adherence";
import { enabledMeals, menuDayFor, optionTotals, parsePlanContent } from "@/lib/nutrition/plan-schema";
import { isMealKey } from "@/lib/nutrition/meals";

/**
 * Socio marks one block of today's plan: followed it (with the option they
 * chose), didn't, or clears the mark. The member and the day come from the
 * session/server clock — nobody can mark for someone else or another day.
 * The day's semáforo is recomputed from all marks.
 */
export async function markPlanMeal(input: {
  mealKey: string;
  status: "done" | "missed" | null;
  optionId?: string | null;
  note?: string | null;
}) {
  const { member } = await requireMember();
  if (!isMealKey(input.mealKey)) throw new Error("Comida inválida.");
  const date = todayDateUtc();

  const plan = await prisma.mealPlan.findFirst({
    where: { memberId: member.id, active: true, visibleToMember: true, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { id: true, content: true },
  });
  const content = parsePlanContent(plan?.content);
  if (!plan || !content) throw new Error("No tienes un plan activo.");
  const meals = enabledMeals(content);
  if (!meals.includes(input.mealKey)) throw new Error("Esa comida no está en tu plan.");

  // Snapshot of the chosen option (MENU) for adherence/kcal history.
  let optionLabel: string | null = null;
  let kcal: number | null = null;
  if (input.status === "done" && content.kind === "MENU" && input.optionId) {
    const day = menuDayFor(content, isoWeekday(ecuadorDateString()));
    const opt = day?.meals.find((m) => m.key === input.mealKey)?.options.find((o) => o.id === input.optionId);
    if (opt) {
      optionLabel = opt.label || null;
      kcal = optionTotals(opt).kcal;
    }
  }

  const log = await prisma.mealLog.upsert({
    where: { memberId_date: { memberId: member.id, date } },
    create: { memberId: member.id, date, mealPlanId: plan.id },
    update: { mealPlanId: plan.id },
    select: { id: true },
  });

  if (input.status === null) {
    await prisma.mealLogEntry.deleteMany({ where: { mealLogId: log.id, mealKey: input.mealKey } });
  } else {
    const data = {
      ate: input.status === "done",
      optionId: input.status === "done" ? input.optionId ?? null : null,
      optionLabel,
      kcal,
      freeText: input.note?.trim() || null,
    };
    await prisma.mealLogEntry.upsert({
      where: { mealLogId_mealKey: { mealLogId: log.id, mealKey: input.mealKey } },
      create: { mealLogId: log.id, mealKey: input.mealKey, ...data },
      update: data,
    });
  }

  const entries = await prisma.mealLogEntry.findMany({ where: { mealLogId: log.id }, select: { mealKey: true, ate: true } });
  const a = adherenceFromChecks(meals, entries);
  await prisma.mealLog.update({
    where: { id: log.id },
    data: { adherence: a.level, followed: a.level === "GREEN" || a.level === "YELLOW" },
  });

  revalidatePath("/portal/nutricion");
  revalidatePath("/portal/hoy");
  return { level: a.level, pct: a.pct };
}
