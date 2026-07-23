"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TestKey } from "@/generated/prisma/client";
import { requireAuth, requireMember, can } from "@/lib/auth";
import { SELF_LOGGABLE_TESTS, SELF_TEST_KEYS } from "@/lib/portal/self-log-tests";
import { notifyStaffOfSelfEntry } from "@/lib/push/notify-staff";

export type SelfLogResult = { ok: true } | { ok: false; error: string };

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * A socio logs their own weight / measurements (e.g. a weekly home weigh-in).
 * Stored as a BodyComposition with source=MEMBER and no evaluationId, so it
 * charts in their personal progress but stays out of the official cycle
 * evaluation, body-fat reports and challenge rankings until a coach verifies it.
 */
export async function logSelfMeasurement(formData: FormData): Promise<SelfLogResult> {
  const { member, user } = await requireMember({ enforceAccess: false });

  const weightKg = num(formData.get("weightKg"));
  const waistCm = num(formData.get("waistCm"));
  const hipCm = num(formData.get("hipCm"));
  const chestCm = num(formData.get("chestCm"));
  const armCm = num(formData.get("armCm"));
  const thighCm = num(formData.get("thighCm"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (weightKg == null && waistCm == null && hipCm == null && chestCm == null
      && armCm == null && thighCm == null) {
    return { ok: false, error: "Ingresa al menos un dato." };
  }
  if (weightKg != null && (weightKg < 20 || weightKg > 400)) {
    return { ok: false, error: "El peso debe estar entre 20 y 400 kg." };
  }
  for (const [label, v] of [["cintura", waistCm], ["cadera", hipCm], ["pecho", chestCm],
                            ["brazo", armCm], ["muslo", thighCm]] as const) {
    if (v != null && (v < 10 || v > 250)) {
      return { ok: false, error: `La medida de ${label} no parece válida.` };
    }
  }

  await prisma.bodyComposition.create({
    data: {
      memberId: member.id,
      measuredAt: new Date(),
      weightKg, waistCm, hipCm, chestCm, armCm, thighCm,
      notes,
      recordedById: user.id,
      source: "MEMBER",
    },
  });

  // Best-effort nudge so a coach validates it instead of it sitting unseen.
  const parts: string[] = [];
  if (weightKg != null) parts.push(`peso ${weightKg} kg`);
  if (waistCm != null) parts.push(`cintura ${waistCm} cm`);
  await notifyStaffOfSelfEntry({
    memberId: member.id,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    memberSede: member.sede,
    summary: parts.length ? `registró ${parts.join(", ")}` : "registró nuevas medidas",
  }).catch(() => undefined);

  revalidatePath("/portal/progreso");
  revalidatePath("/portal/hoy");
  return { ok: true };
}

/**
 * A socio logs a personal record for one of the self-loggable lifts. Same rule:
 * visible to them right away, counts for rankings only once verified.
 */
export async function logSelfPr(formData: FormData): Promise<SelfLogResult> {
  const { member, user } = await requireMember({ enforceAccess: false });

  const test = String(formData.get("test") ?? "");
  const value = num(formData.get("value"));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!SELF_TEST_KEYS.has(test)) {
    return { ok: false, error: "Ejercicio no válido." };
  }
  if (value == null || value <= 0) {
    return { ok: false, error: "Ingresa una marca válida." };
  }
  const meta = SELF_LOGGABLE_TESTS.find((t) => t.key === test)!;
  const ceiling = meta.unit === "reps" ? 200 : 500;
  if (value > ceiling) {
    return { ok: false, error: `Esa marca parece fuera de rango (máx. ${ceiling} ${meta.unit}).` };
  }

  await prisma.testResult.create({
    data: {
      memberId: member.id,
      test: test as TestKey,
      valueNumeric: value,
      unit: meta.unit,
      recordedAt: new Date(),
      recordedByUserId: user.id,
      notes,
      source: "MEMBER",
    },
  });

  await notifyStaffOfSelfEntry({
    memberId: member.id,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    memberSede: member.sede,
    summary: `nueva marca en ${meta.label}: ${value} ${meta.unit}`,
  }).catch(() => undefined);

  revalidatePath("/portal/progreso");
  return { ok: true };
}

/** A socio may remove their own self-reported entry while it's still unverified. */
export async function deleteSelfEntry(
  kind: "measurement" | "pr",
  id: string,
): Promise<SelfLogResult> {
  const { member } = await requireMember({ enforceAccess: false });

  if (kind === "measurement") {
    const row = await prisma.bodyComposition.findUnique({ where: { id } });
    if (!row || row.memberId !== member.id) return { ok: false, error: "No encontrado." };
    if (row.source !== "MEMBER" || row.verifiedAt) {
      return { ok: false, error: "Ese registro ya fue validado por tu coach." };
    }
    await prisma.bodyComposition.delete({ where: { id } });
  } else {
    const row = await prisma.testResult.findUnique({ where: { id } });
    if (!row || row.memberId !== member.id) return { ok: false, error: "No encontrado." };
    if (row.source !== "MEMBER" || row.verifiedAt) {
      return { ok: false, error: "Ese registro ya fue validado por tu coach." };
    }
    await prisma.testResult.delete({ where: { id } });
  }

  revalidatePath("/portal/progreso");
  return { ok: true };
}

/**
 * Staff validates a self-reported entry. Once verified it counts for reports and
 * challenge rankings exactly like a staff-taken measurement.
 */
export async function verifySelfEntry(
  kind: "measurement" | "pr",
  id: string,
  memberId: string,
): Promise<SelfLogResult> {
  const user = await requireAuth();
  const allowed = kind === "measurement" ? can.editBodyComp(user) : can.editTests(user);
  if (!allowed) return { ok: false, error: "Sin permisos para validar." };

  const data = { verifiedAt: new Date(), verifiedByUserId: user.id };
  if (kind === "measurement") {
    await prisma.bodyComposition.update({ where: { id }, data });
  } else {
    await prisma.testResult.update({ where: { id }, data });
  }

  revalidatePath(`/dashboard/socios/${memberId}`);
  return { ok: true };
}

/** Staff rejects a self-reported entry (wrong/implausible) — removes it. */
export async function rejectSelfEntry(
  kind: "measurement" | "pr",
  id: string,
  memberId: string,
): Promise<SelfLogResult> {
  const user = await requireAuth();
  const allowed = kind === "measurement" ? can.editBodyComp(user) : can.editTests(user);
  if (!allowed) return { ok: false, error: "Sin permisos." };

  if (kind === "measurement") {
    const row = await prisma.bodyComposition.findUnique({ where: { id } });
    if (!row || row.source !== "MEMBER") return { ok: false, error: "Solo se descartan registros del socio." };
    await prisma.bodyComposition.delete({ where: { id } });
  } else {
    const row = await prisma.testResult.findUnique({ where: { id } });
    if (!row || row.source !== "MEMBER") return { ok: false, error: "Solo se descartan registros del socio." };
    await prisma.testResult.delete({ where: { id } });
  }

  revalidatePath(`/dashboard/socios/${memberId}`);
  return { ok: true };
}

/**
 * Self-reported entries for a member, newest first — powers the validation panel
 * on the staff member profile. Staff-taken records are excluded (they need no
 * validation).
 */
export async function getMemberSelfEntries(memberId: string) {
  await requireAuth();

  const [comps, prs] = await Promise.all([
    prisma.bodyComposition.findMany({
      where: { memberId, source: "MEMBER" },
      orderBy: { measuredAt: "desc" },
      take: 25,
    }),
    prisma.testResult.findMany({
      where: { memberId, source: "MEMBER" },
      orderBy: { recordedAt: "desc" },
      take: 25,
    }),
  ]);

  const fmt = (d: Date) =>
    d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" });

  const measurement = comps.map((c) => {
    const parts: string[] = [];
    if (c.weightKg != null) parts.push(`Peso ${c.weightKg} kg`);
    if (c.waistCm != null) parts.push(`Cintura ${c.waistCm} cm`);
    if (c.hipCm != null) parts.push(`Cadera ${c.hipCm} cm`);
    if (c.chestCm != null) parts.push(`Pecho ${c.chestCm} cm`);
    if (c.armCm != null) parts.push(`Brazo ${c.armCm} cm`);
    if (c.thighCm != null) parts.push(`Muslo ${c.thighCm} cm`);
    return {
      id: c.id,
      kind: "measurement" as const,
      at: fmt(c.measuredAt),
      sortAt: c.measuredAt.getTime(),
      summary: parts.join(" · ") || "Medición",
      notes: c.notes,
      verified: c.verifiedAt != null,
    };
  });

  const marks = prs.map((t) => {
    const label = SELF_LOGGABLE_TESTS.find((s) => s.key === t.test)?.label ?? t.test;
    return {
      id: t.id,
      kind: "pr" as const,
      at: fmt(t.recordedAt),
      sortAt: t.recordedAt.getTime(),
      summary: `${label} — ${t.valueNumeric} ${t.unit}`,
      notes: t.notes,
      verified: t.verifiedAt != null,
    };
  });

  return [...measurement, ...marks]
    .sort((a, b) => b.sortAt - a.sortAt)
    .map(({ sortAt: _sortAt, ...rest }) => rest);
}
