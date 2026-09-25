"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { ageFrom } from "@/lib/nutrition/calc";
import { normalizeMealSplit } from "@/lib/nutrition/meals";
import type { Sex, TargetSource } from "@/generated/prisma/client";

async function requireNutrition() {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Sin permisos");
  return user;
}

export type MemberCalcContext = {
  memberId: string;
  name: string;
  sex: Sex | null;
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  measuredBmr: number | null;
  measuredAt: Date | null;
  target: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    mealSplit: Record<string, number>;
    source: TargetSource;
    updatedAt: Date;
  } | null;
};

/**
 * Everything the calculator needs about a socio: sex, age and the latest body
 * composition. Height and weight may come from different measurements (height
 * is rarely re-measured), so each field takes its most recent non-null value.
 */
export async function getMemberCalcContext(memberId: string): Promise<MemberCalcContext | null> {
  await requireNutrition();
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sex: true,
      dateOfBirth: true,
      nutritionTarget: true,
      bodyCompositions: {
        orderBy: { measuredAt: "desc" },
        take: 12,
        select: { measuredAt: true, weightKg: true, heightCm: true, bodyFatPct: true, basalMetabolism: true },
      },
    },
  });
  if (!member) return null;
  const bc = member.bodyCompositions;
  const latest = <K extends keyof (typeof bc)[number]>(k: K) => bc.find((b) => b[k] !== null)?.[k] ?? null;
  const t = member.nutritionTarget;

  return {
    memberId: member.id,
    name: `${member.firstName} ${member.lastName}`.trim(),
    sex: member.sex,
    ageYears: member.dateOfBirth ? ageFrom(member.dateOfBirth) : null,
    weightKg: latest("weightKg") as number | null,
    heightCm: latest("heightCm") as number | null,
    bodyFatPct: latest("bodyFatPct") as number | null,
    measuredBmr: latest("basalMetabolism") as number | null,
    measuredAt: bc[0]?.measuredAt ?? null,
    target: t
      ? {
          kcal: t.kcal,
          proteinG: t.proteinG,
          carbsG: t.carbsG,
          fatG: t.fatG,
          mealSplit: normalizeMealSplit(t.mealSplit as Record<string, number>),
          source: t.source,
          updatedAt: t.updatedAt,
        }
      : null,
  };
}

/** The nutritionist sets a socio's daily target (the socio can't overwrite it). */
export async function saveNutritionTarget(
  memberId: string,
  input: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    mealSplit?: Record<string, number>;
    inputs?: Record<string, unknown>;
  },
) {
  const user = await requireNutrition();
  const kcal = Math.round(input.kcal);
  if (!(kcal >= 800 && kcal <= 6000)) throw new Error("La meta debe estar entre 800 y 6000 kcal.");
  const data = {
    kcal,
    proteinG: Math.round(input.proteinG),
    carbsG: Math.round(input.carbsG),
    fatG: Math.round(input.fatG),
    mealSplit: normalizeMealSplit(input.mealSplit),
    inputs: (input.inputs ?? undefined) as object | undefined,
    source: "NUTRITIONIST" as const,
    updatedById: user.id,
  };
  await prisma.nutritionTarget.upsert({
    where: { memberId },
    create: { memberId, ...data },
    update: data,
  });
  revalidatePath(`/dashboard/socios/${memberId}`);
  revalidatePath("/dashboard/nutricion/calculadora");
}

/** Socio lookup for the calculator page. */
export async function searchMembersForCalc(query: string) {
  await requireNutrition();
  const tokens = query.trim().split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  return prisma.member.findMany({
    where: {
      status: { not: "CHURNED" },
      AND: tokens.map((t) => ({
        OR: [
          { firstName: { contains: t, mode: "insensitive" as const } },
          { lastName: { contains: t, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 10,
    select: { id: true, firstName: true, lastName: true, sede: true, status: true },
  });
}
