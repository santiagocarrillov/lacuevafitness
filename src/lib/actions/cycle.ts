"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { ecuadorParts } from "@/lib/portal/tz";

/** "YYYY-MM-DD" → UTC-midnight Date for the @db.Date column. Defaults to today (Ecuador). */
function toDbDate(dateStr?: string): Date {
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const { year, month, day } = ecuadorParts(new Date());
  return new Date(Date.UTC(year, month - 1, day));
}

export async function getMemberPeriods() {
  const { member } = await requireMember();
  return prisma.menstrualPeriod.findMany({
    where: { memberId: member.id },
    orderBy: { startDate: "desc" },
    take: 24,
  });
}

export async function logPeriodStart(startDate?: string) {
  const { member } = await requireMember();
  const start = toDbDate(startDate);

  // Avoid duplicate same-day starts (idempotent-ish).
  const existing = await prisma.menstrualPeriod.findFirst({
    where: { memberId: member.id, startDate: start },
  });
  if (!existing) {
    await prisma.menstrualPeriod.create({
      data: { memberId: member.id, startDate: start },
    });
  }
  revalidatePath("/portal/cuenta/ciclo");
  return { success: true };
}

export async function setPeriodEnd(id: string, endDate: string | null) {
  const { member } = await requireMember();
  const row = await prisma.menstrualPeriod.findUnique({ where: { id } });
  if (!row || row.memberId !== member.id) throw new Error("No encontrado");

  await prisma.menstrualPeriod.update({
    where: { id },
    data: { endDate: endDate ? toDbDate(endDate) : null },
  });
  revalidatePath("/portal/cuenta/ciclo");
  return { success: true };
}

/** Member removes one of their own entries (personal health data they control). */
export async function deletePeriod(id: string) {
  const { member } = await requireMember();
  const row = await prisma.menstrualPeriod.findUnique({ where: { id } });
  if (!row || row.memberId !== member.id) throw new Error("No encontrado");

  await prisma.menstrualPeriod.delete({ where: { id } });
  revalidatePath("/portal/cuenta/ciclo");
  return { success: true };
}
