"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";

/**
 * Private clinical records (free-text anamnesis / history). Staff-only by
 * construction: these actions and the dashboard capture UI are the ONLY code that
 * touches ClinicalRecord. No portal page, server component, or action references
 * this model — privacy is structural, not flag-based. Gated by can.editBodyComp
 * (OWNER / NUTRITIONIST / ADMIN), the same capability as body composition.
 */

export async function getClinicalRecords(memberId: string) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  return prisma.clinicalRecord.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    include: { authoredBy: { select: { fullName: true } } },
  });
}

export async function addClinicalRecord(data: { memberId: string; content: string }) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  if (!data.content.trim()) throw new Error("La nota no puede estar vacía.");

  const record = await prisma.clinicalRecord.create({
    data: {
      memberId: data.memberId,
      content: data.content.trim(),
      authoredById: user.id,
    },
  });
  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return record;
}

export async function updateClinicalRecord(data: {
  id: string;
  memberId: string;
  content: string;
}) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  if (!data.content.trim()) throw new Error("La nota no puede estar vacía.");

  await prisma.clinicalRecord.update({
    where: { id: data.id },
    data: { content: data.content.trim() },
  });
  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return { success: true };
}

export async function deleteClinicalRecord(id: string, memberId: string) {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) throw new Error("Sin permisos");
  await prisma.clinicalRecord.delete({ where: { id } });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}
