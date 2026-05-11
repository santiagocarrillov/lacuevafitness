"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export type SessionOverrideData = {
  activacionMd: string | null;
  fuerzaMd: string | null;
  acondicionamientoMd: string | null;
  regulacionMd: string | null;
  coachNotesMd: string | null;
  updatedAt?: Date;
  updatedByName?: string;
};

export async function getSessionOverride(
  weekNumber: number,
  dayIndex: number,
): Promise<SessionOverrideData | null> {
  const row = await prisma.srxfitSessionOverride.findUnique({
    where: { weekNumber_dayIndex: { weekNumber, dayIndex } },
    include: { updatedBy: { select: { fullName: true } } },
  });
  if (!row) return null;
  return {
    activacionMd: row.activacionMd,
    fuerzaMd: row.fuerzaMd,
    acondicionamientoMd: row.acondicionamientoMd,
    regulacionMd: row.regulacionMd,
    coachNotesMd: row.coachNotesMd,
    updatedAt: row.updatedAt,
    updatedByName: row.updatedBy?.fullName,
  };
}

export async function upsertSessionOverride(
  weekNumber: number,
  dayIndex: number,
  data: {
    activacionMd: string | null;
    fuerzaMd: string | null;
    acondicionamientoMd: string | null;
    regulacionMd: string | null;
    coachNotesMd: string | null;
  },
) {
  const user = await requireAuth();
  if (user.role !== "OWNER") throw new Error("Sin permisos");

  await prisma.srxfitSessionOverride.upsert({
    where: { weekNumber_dayIndex: { weekNumber, dayIndex } },
    update: { ...data, updatedById: user.id },
    create: { weekNumber, dayIndex, ...data, updatedById: user.id },
  });

  revalidatePath("/dashboard/srxfit/calendario");
  return { success: true };
}

export async function deleteSessionOverride(weekNumber: number, dayIndex: number) {
  const user = await requireAuth();
  if (user.role !== "OWNER") throw new Error("Sin permisos");

  await prisma.srxfitSessionOverride.deleteMany({
    where: { weekNumber, dayIndex },
  });

  revalidatePath("/dashboard/srxfit/calendario");
  return { success: true };
}
