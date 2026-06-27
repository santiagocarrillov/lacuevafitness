"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, can } from "@/lib/auth";
import { ecuadorParts } from "@/lib/portal/tz";

// ── Meal plans (staff: nutritionist/owner/admin) ─────────────────────

type MealPlanInput = {
  title: string;
  calorieTarget?: number | null;
  externalUrl?: string | null;
  startsAt?: string | null; // ISO date
  endsAt?: string | null;
  visibleToMember?: boolean;
};

function cleanPlanData(data: MealPlanInput) {
  return {
    title: data.title.trim(),
    calorieTarget: data.calorieTarget ?? null,
    externalUrl: data.externalUrl?.trim() || null,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    visibleToMember: data.visibleToMember ?? true,
  };
}

export async function createMealPlan(memberId: string, data: MealPlanInput) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  if (!data.title?.trim()) throw new Error("El plan necesita un título.");

  const plan = await prisma.mealPlan.create({
    data: {
      memberId,
      ...cleanPlanData(data),
      source: "MANUAL",
      authoredById: user.id,
    },
  });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return plan;
}

export async function updateMealPlan(id: string, memberId: string, data: MealPlanInput) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  if (!data.title?.trim()) throw new Error("El plan necesita un título.");

  await prisma.mealPlan.update({ where: { id }, data: cleanPlanData(data) });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

/** Soft archive / restore — no hard delete (CLAUDE.md). */
export async function setMealPlanActive(id: string, memberId: string, active: boolean) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  await prisma.mealPlan.update({ where: { id }, data: { active } });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

export async function getMemberMealPlans(memberId: string) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  return prisma.mealPlan.findMany({
    where: { memberId },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

export async function getMemberMealLogs(memberId: string, take = 30) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  return prisma.mealLog.findMany({
    where: { memberId },
    orderBy: { date: "desc" },
    take,
  });
}

// ── Daily adherence log (member-callable) ────────────────────────────

/** Ecuador local calendar day, stored at UTC midnight for the @db.Date column. */
function ecuadorToday(): Date {
  const { year, month, day } = ecuadorParts(new Date());
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Member logs today's adherence. The member is taken from the session and the
 * date is computed server-side (Ecuador day) — a client cannot log for someone
 * else or backdate. Idempotent via the (memberId, date) unique key.
 */
export async function logMeal(data: { followed: boolean; freeText?: string }) {
  const { member } = await requireMember();
  const date = ecuadorToday();

  // Link the log to the plan currently in effect (if any), for adherence context.
  const activePlan = await prisma.mealPlan.findFirst({
    where: { memberId: member.id, active: true, visibleToMember: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const freeText = data.freeText?.trim() || null;

  await prisma.mealLog.upsert({
    where: { memberId_date: { memberId: member.id, date } },
    create: {
      memberId: member.id,
      date,
      followed: data.followed,
      freeText,
      mealPlanId: activePlan?.id ?? null,
    },
    update: {
      followed: data.followed,
      freeText,
      mealPlanId: activePlan?.id ?? null,
    },
  });

  revalidatePath("/portal/hoy");
  return { success: true };
}
