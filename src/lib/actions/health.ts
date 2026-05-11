"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import type { MenopausalStatus, Sex } from "@/generated/prisma/client";

function canEditHealth(role: string) {
  return role === "OWNER" || role === "NUTRITIONIST";
}

// Parse "YYYY-MM-DD" as local-noon to avoid timezone shifting the displayed day.
function parseDate(s: string | null | undefined): Date {
  if (!s) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return new Date(s);
}

// ─── Body composition ────────────────────────────────────────────────

type BodyCompInput = {
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  muscleMassPct?: number | null;
  waistCm?: number | null;
  basalMetabolism?: number | null;
  notes?: string | null;
  measuredAt?: string | null;
};

export async function recordBodyComp(memberId: string, data: BodyCompInput) {
  const user = await requireAuth();
  if (!canEditHealth(user.role)) throw new Error("Sin permisos");

  await prisma.bodyComposition.create({
    data: {
      memberId,
      weightKg: data.weightKg ?? null,
      heightCm: data.heightCm ?? null,
      bodyFatPct: data.bodyFatPct ?? null,
      muscleMassPct: data.muscleMassPct ?? null,
      waistCm: data.waistCm ?? null,
      basalMetabolism: data.basalMetabolism ?? null,
      notes: data.notes || null,
      measuredAt: parseDate(data.measuredAt),
      recordedById: user.id,
    },
  });

  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

export async function updateBodyComp(id: string, memberId: string, data: BodyCompInput) {
  const user = await requireAuth();
  if (!canEditHealth(user.role)) throw new Error("Sin permisos");

  await prisma.bodyComposition.update({
    where: { id },
    data: {
      weightKg: data.weightKg ?? null,
      heightCm: data.heightCm ?? null,
      bodyFatPct: data.bodyFatPct ?? null,
      muscleMassPct: data.muscleMassPct ?? null,
      waistCm: data.waistCm ?? null,
      basalMetabolism: data.basalMetabolism ?? null,
      notes: data.notes || null,
      ...(data.measuredAt ? { measuredAt: parseDate(data.measuredAt) } : {}),
    },
  });

  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

export async function deleteBodyComp(id: string, memberId: string) {
  const user = await requireAuth();
  if (!canEditHealth(user.role)) throw new Error("Sin permisos");
  await prisma.bodyComposition.delete({ where: { id } });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

// ─── Clinical markers ────────────────────────────────────────────────

type ClinicalInput = {
  glucoseFasting?: number | null;
  triglycerides?: number | null;
  hdlCholesterol?: number | null;
  hsCRP?: number | null;
  testosteroneFree?: number | null;
  estradiolE2?: number | null;
  cycleDay?: number | null;
  menopausalStatus?: MenopausalStatus | null;
  notes?: string | null;
  measuredAt?: string | null;
};

export async function recordClinicalMarker(memberId: string, data: ClinicalInput) {
  const user = await requireAuth();
  if (!canEditHealth(user.role)) throw new Error("Sin permisos");

  await prisma.clinicalMarker.create({
    data: {
      memberId,
      glucoseFasting: data.glucoseFasting ?? null,
      triglycerides: data.triglycerides ?? null,
      hdlCholesterol: data.hdlCholesterol ?? null,
      hsCRP: data.hsCRP ?? null,
      testosteroneFree: data.testosteroneFree ?? null,
      estradiolE2: data.estradiolE2 ?? null,
      cycleDay: data.cycleDay ?? null,
      menopausalStatus: data.menopausalStatus ?? null,
      notes: data.notes || null,
      measuredAt: parseDate(data.measuredAt),
      recordedById: user.id,
    },
  });

  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

export async function updateClinicalMarker(id: string, memberId: string, data: ClinicalInput) {
  const user = await requireAuth();
  if (!canEditHealth(user.role)) throw new Error("Sin permisos");

  await prisma.clinicalMarker.update({
    where: { id },
    data: {
      glucoseFasting: data.glucoseFasting ?? null,
      triglycerides: data.triglycerides ?? null,
      hdlCholesterol: data.hdlCholesterol ?? null,
      hsCRP: data.hsCRP ?? null,
      testosteroneFree: data.testosteroneFree ?? null,
      estradiolE2: data.estradiolE2 ?? null,
      cycleDay: data.cycleDay ?? null,
      menopausalStatus: data.menopausalStatus ?? null,
      notes: data.notes || null,
      ...(data.measuredAt ? { measuredAt: parseDate(data.measuredAt) } : {}),
    },
  });

  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

export async function deleteClinicalMarker(id: string, memberId: string) {
  const user = await requireAuth();
  if (!canEditHealth(user.role)) throw new Error("Sin permisos");
  await prisma.clinicalMarker.delete({ where: { id } });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}

// ─── Update member sex ───────────────────────────────────────────────

export async function updateMemberSex(memberId: string, sex: Sex | null) {
  const user = await requireAuth();
  if (!canEditHealth(user.role)) throw new Error("Sin permisos");
  await prisma.member.update({ where: { id: memberId }, data: { sex } });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return { success: true };
}
