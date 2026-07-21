"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, can } from "@/lib/auth";
import { ecuadorParts } from "@/lib/portal/tz";
import type { AdherenceLevel, Sede } from "@/generated/prisma/client";

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
export async function logMeal(data: {
  adherence?: AdherenceLevel | null;
  followed?: boolean; // legacy; derived from adherence when omitted
  freeText?: string;
}) {
  const { member } = await requireMember();
  const date = ecuadorToday();

  // Link the log to the plan currently in effect (if any), for adherence context.
  const activePlan = await prisma.mealPlan.findFirst({
    where: { memberId: member.id, active: true, visibleToMember: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const freeText = data.freeText?.trim() || null;
  const adherence = data.adherence ?? null;
  // Legacy boolean stays in sync: "cumplió" = verde o amarillo (≥60%).
  const followed =
    data.followed ?? (adherence === "GREEN" || adherence === "YELLOW");

  await prisma.mealLog.upsert({
    where: { memberId_date: { memberId: member.id, date } },
    create: {
      memberId: member.id,
      date,
      adherence,
      followed,
      freeText,
      mealPlanId: activePlan?.id ?? null,
    },
    update: {
      adherence,
      followed,
      freeText,
      mealPlanId: activePlan?.id ?? null,
    },
  });

  revalidatePath("/portal/hoy");
  revalidatePath("/portal/nutricion");
  return { success: true };
}

// ── Prioridad de la semana (nutritionist → member) ───────────────────

export async function getNutritionFocus(memberId: string) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  return prisma.nutritionFocus.findUnique({ where: { memberId } });
}

export async function upsertNutritionFocus(memberId: string, message: string) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  const text = message.trim();
  if (!text) {
    // Empty message clears the focus.
    await prisma.nutritionFocus.deleteMany({ where: { memberId } });
  } else {
    await prisma.nutritionFocus.upsert({
      where: { memberId },
      create: { memberId, message: text, authoredById: user.id },
      update: { message: text, authoredById: user.id },
    });
  }
  revalidatePath(`/dashboard/socios/${memberId}`);
  revalidatePath("/portal/nutricion");
  return { success: true };
}

// ── Cápsulas de consejos (biblioteca que administra la nutricionista) ─

type TipInput = { title: string; body: string; sede?: Sede | null };

export async function getNutritionTips(opts?: { sede?: Sede; activeOnly?: boolean }) {
  const where: { active?: boolean; OR?: object[] } = {};
  if (opts?.activeOnly) where.active = true;
  if (opts?.sede) where.OR = [{ sede: opts.sede }, { sede: null }];
  return prisma.nutritionTip.findMany({
    where,
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

export async function createNutritionTip(data: TipInput) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  if (!data.title?.trim() || !data.body?.trim()) throw new Error("Título y contenido requeridos.");
  const tip = await prisma.nutritionTip.create({
    data: {
      title: data.title.trim(),
      body: data.body.trim(),
      sede: data.sede ?? null,
      authoredById: user.id,
    },
  });
  revalidatePath("/dashboard/nutricion");
  revalidatePath("/portal/nutricion");
  return tip;
}

export async function updateNutritionTip(id: string, data: TipInput) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  if (!data.title?.trim() || !data.body?.trim()) throw new Error("Título y contenido requeridos.");
  await prisma.nutritionTip.update({
    where: { id },
    data: { title: data.title.trim(), body: data.body.trim(), sede: data.sede ?? null },
  });
  revalidatePath("/dashboard/nutricion");
  revalidatePath("/portal/nutricion");
  return { success: true };
}

/** Soft archive / restore — no hard delete (CLAUDE.md). */
export async function setNutritionTipActive(id: string, active: boolean) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  await prisma.nutritionTip.update({ where: { id }, data: { active } });
  revalidatePath("/dashboard/nutricion");
  revalidatePath("/portal/nutricion");
  return { success: true };
}
