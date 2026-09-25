"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, can } from "@/lib/auth";
import { pushToMember } from "@/lib/push/send";
import { notifyStaff } from "@/lib/push/notify-staff";
import { todayDateUtc } from "@/lib/timezone";
import { isMealKey, MEAL_LABEL } from "@/lib/nutrition/meals";

const MAX_LEN = 2000;

function cleanBody(body: string): string {
  const b = body.trim();
  if (!b) throw new Error("Escribe un mensaje.");
  if (b.length > MAX_LEN) throw new Error(`Máximo ${MAX_LEN} caracteres.`);
  return b;
}

// ── Socio side ───────────────────────────────────────────────────────

/** Socio writes to the nutritionist, optionally about one meal of today's plan. */
export async function sendNutritionMessage(input: { body: string; mealKey?: string | null }) {
  const { member } = await requireMember();
  const body = cleanBody(input.body);
  const mealKey = input.mealKey && isMealKey(input.mealKey) ? input.mealKey : null;
  const plan = await prisma.mealPlan.findFirst({
    where: { memberId: member.id, active: true, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { id: true },
  });
  await prisma.nutritionMessage.create({
    data: {
      memberId: member.id,
      author: "MEMBER",
      body,
      mealKey,
      date: mealKey ? todayDateUtc() : null,
      mealPlanId: plan?.id ?? null,
    },
  });
  const about = mealKey ? ` (${MEAL_LABEL[mealKey].toLowerCase()})` : "";
  await notifyStaff({
    roles: ["NUTRITIONIST"],
    sede: member.sede,
    excludeMemberId: member.id,
    payload: {
      title: `Mensaje de ${member.firstName}${about}`,
      body: body.slice(0, 120),
      url: `/dashboard/nutricion/socios/${member.id}`,
    },
  }).catch(() => undefined);
  revalidatePath("/portal/nutricion");
  revalidatePath(`/dashboard/nutricion/socios/${member.id}`);
}

/** Socio opened the thread: the nutritionist's replies count as read. */
export async function markStaffMessagesRead() {
  const { member } = await requireMember({ enforceAccess: false });
  await prisma.nutritionMessage.updateMany({
    where: { memberId: member.id, author: "STAFF", readAt: null },
    data: { readAt: new Date() },
  });
}

// ── Staff side ───────────────────────────────────────────────────────

async function requireNutrition() {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Sin permisos");
  return user;
}

export async function replyNutritionMessage(memberId: string, body: string) {
  const user = await requireNutrition();
  const text = cleanBody(body);
  await prisma.$transaction([
    prisma.nutritionMessage.create({ data: { memberId, author: "STAFF", authorUserId: user.id, body: text } }),
    // Answering implies she read what the socio wrote.
    prisma.nutritionMessage.updateMany({
      where: { memberId, author: "MEMBER", readAt: null },
      data: { readAt: new Date() },
    }),
  ]);
  await pushToMember(memberId, {
    title: "Tu nutricionista te respondió",
    body: text.slice(0, 120),
    url: "/portal/nutricion?tab=chat",
  }).catch(() => undefined);
  revalidatePath(`/dashboard/nutricion/socios/${memberId}`);
  revalidatePath("/dashboard/nutricion/socios");
  revalidatePath("/portal/nutricion");
}

export async function markMemberMessagesRead(memberId: string) {
  await requireNutrition();
  await prisma.nutritionMessage.updateMany({
    where: { memberId, author: "MEMBER", readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard/nutricion/socios");
}
