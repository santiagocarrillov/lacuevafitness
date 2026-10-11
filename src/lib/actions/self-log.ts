"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TestKey, type User } from "@/generated/prisma/client";
import { requireAuth, requireMember, can, getSedeScope } from "@/lib/auth";
import { SELF_LOGGABLE_TESTS, SELF_TEST_KEYS } from "@/lib/portal/self-log-tests";
import { estimate1Rm, formatMainSet, validateMainSet } from "@/lib/self-log/main-set";
import { getSessionForDate } from "@/lib/srxfit-calendar";
import { ecuadorParts } from "@/lib/portal/tz";
import {
  notifyMembersOfReview,
  notifyStaffOfSelfEntry,
  VALIDATION_QUEUE_PATH,
  type ReviewedEntry,
} from "@/lib/self-log/notify";

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

  const created = await prisma.bodyComposition.create({
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
    kind: "measurement",
    entryId: created.id,
    memberId: member.id,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    memberSede: member.sede,
    summary: parts.length ? `registró ${parts.join(", ")}` : "registró nuevas medidas",
  }).catch(() => undefined);
  revalidatePath(VALIDATION_QUEUE_PATH);

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

  const created = await prisma.testResult.create({
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
    kind: "pr",
    entryId: created.id,
    memberId: member.id,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    memberSede: member.sede,
    summary: `nueva marca en ${meta.label}: ${value} ${meta.unit}`,
  }).catch(() => undefined);
  revalidatePath(VALIDATION_QUEUE_PATH);

  revalidatePath("/portal/progreso");
  return { ok: true };
}

/**
 * A socio logs the best set of today's main lift (Manual SRXFIT v3, 9.5):
 * load, reps and reps in reserve. One per training day; saving again replaces
 * it while a coach has not validated it. The day comes from the server clock
 * (Ecuador), never from the form.
 */
export async function logMainSet(formData: FormData): Promise<SelfLogResult> {
  const { member, user } = await requireMember({ enforceAccess: false });

  const exercise = String(formData.get("exercise") ?? "").trim().replace(/\s+/g, " ");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 200) || null;
  const parsed = validateMainSet({
    exercise,
    loadKg: num(formData.get("loadKg")),
    reps: num(formData.get("reps")),
    rir: num(formData.get("rir")),
  });
  if (!parsed.ok) return parsed;

  const { year, month, day } = ecuadorParts(new Date());
  const date = new Date(Date.UTC(year, month - 1, day));
  const session = getSessionForDate(new Date(year, month - 1, day));

  const existing = await prisma.mainSetLog.findUnique({ where: { memberId_date: { memberId: member.id, date } } });
  if (existing && (existing.source !== "MEMBER" || existing.verifiedAt)) {
    return { ok: false, error: "Tu serie de hoy ya fue validada por tu coach." };
  }

  const data = {
    exercise,
    ...parsed.set,
    notes,
    weekNumber: session?.weekNumber ?? null,
    pattern: session?.pattern ?? null,
    recordedByUserId: user.id,
  };
  const saved = existing
    ? await prisma.mainSetLog.update({ where: { id: existing.id }, data })
    : await prisma.mainSetLog.create({ data: { ...data, memberId: member.id, date, source: "MEMBER" } });

  if (!existing) {
    await notifyStaffOfSelfEntry({
      kind: "set",
      entryId: saved.id,
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`.trim(),
      memberSede: member.sede,
      summary: `serie principal de ${exercise}: ${formatMainSet(parsed.set)}`,
    }).catch(() => undefined);
  }
  revalidatePath(VALIDATION_QUEUE_PATH);
  revalidatePath("/portal/hoy");
  return { ok: true };
}

/** A socio may remove their own self-reported entry while it's still unverified. */
export async function deleteSelfEntry(
  kind: EntryKind,
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
  } else if (kind === "set") {
    const row = await prisma.mainSetLog.findUnique({ where: { id } });
    if (!row || row.memberId !== member.id) return { ok: false, error: "No encontrado." };
    if (row.source !== "MEMBER" || row.verifiedAt) {
      return { ok: false, error: "Ese registro ya fue validado por tu coach." };
    }
    await prisma.mainSetLog.delete({ where: { id } });
    revalidatePath("/portal/hoy");
    revalidatePath(VALIDATION_QUEUE_PATH);
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

type EntryKind = "measurement" | "pr" | "set";

function canReview(user: User, kind: EntryKind) {
  return kind === "measurement" ? can.editBodyComp(user) : can.editTests(user);
}

/**
 * Load the still-pending self-reported rows among `ids` that this user may
 * review: right kind of permission, and — for sede-scoped staff — socios of
 * their sede (primary or secondary).
 */
async function reviewableRows(user: User, kind: EntryKind, ids: string[]): Promise<(ReviewedEntry & { id: string })[]> {
  if (!canReview(user, kind) || ids.length === 0) return [];
  const scope = getSedeScope(user);
  const where = {
    id: { in: ids },
    source: "MEMBER" as const,
    verifiedAt: null,
    ...(scope ? { member: { OR: [{ sede: scope }, { secondarySede: scope }] } } : {}),
  };
  if (kind === "measurement") {
    const rows = await prisma.bodyComposition.findMany({ where, select: { id: true, memberId: true } });
    return rows.map((r) => ({ id: r.id, memberId: r.memberId, kind: "measurement", label: "Tus medidas" }));
  }
  if (kind === "set") {
    const rows = await prisma.mainSetLog.findMany({ where, select: { id: true, memberId: true, exercise: true, loadKg: true, reps: true, rir: true } });
    return rows.map((r) => ({ id: r.id, memberId: r.memberId, kind: "set", label: `${r.exercise}: ${formatMainSet(r)}` }));
  }
  const rows = await prisma.testResult.findMany({ where, select: { id: true, memberId: true, test: true, valueNumeric: true, unit: true } });
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    kind: "pr",
    label: `${SELF_LOGGABLE_TESTS.find((t) => t.key === r.test)?.label ?? r.test}: ${r.valueNumeric} ${r.unit}`,
  }));
}

function revalidateReview(memberIds: string[]) {
  revalidatePath(VALIDATION_QUEUE_PATH);
  for (const id of new Set(memberIds)) revalidatePath(`/dashboard/socios/${id}`);
}

/**
 * Staff validates a self-reported entry. Once verified it counts for reports and
 * challenge rankings exactly like a staff-taken measurement. The socio gets a
 * push saying so.
 */
export async function verifySelfEntry(kind: EntryKind, id: string, _memberId?: string): Promise<SelfLogResult> {
  const res = await verifySelfEntries([{ kind, id }]);
  return res.ok ? { ok: true } : res;
}

/**
 * "Validar" on several entries at once (the queue's "Validar todos los
 * verdes"). Only rows still pending and within this user's reach are touched;
 * returns how many were validated.
 */
export async function verifySelfEntries(
  items: { kind: EntryKind; id: string }[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const user = await requireAuth();
  if (!Array.isArray(items) || items.length > 300) return { ok: false, error: "Lista no válida." };
  const prIds = items.filter((i) => i.kind === "pr").map((i) => i.id);
  const setIds = items.filter((i) => i.kind === "set").map((i) => i.id);
  const compIds = items.filter((i) => i.kind === "measurement").map((i) => i.id);
  if (((prIds.length || setIds.length) && !can.editTests(user)) || (compIds.length && !can.editBodyComp(user))) {
    return { ok: false, error: "Sin permisos para validar." };
  }

  const [prs, comps, sets] = await Promise.all([
    reviewableRows(user, "pr", prIds),
    reviewableRows(user, "measurement", compIds),
    reviewableRows(user, "set", setIds),
  ]);
  if (prs.length + comps.length + sets.length === 0) return { ok: false, error: "Ese registro ya fue revisado." };

  const data = { verifiedAt: new Date(), verifiedByUserId: user.id };
  const pending = { source: "MEMBER" as const, verifiedAt: null };
  await prisma.$transaction([
    prisma.testResult.updateMany({ where: { id: { in: prs.map((p) => p.id) }, ...pending }, data }),
    prisma.bodyComposition.updateMany({ where: { id: { in: comps.map((c) => c.id) }, ...pending }, data }),
    prisma.mainSetLog.updateMany({ where: { id: { in: sets.map((s) => s.id) }, ...pending }, data }),
  ]);

  const reviewed = [...prs, ...comps, ...sets];
  await notifyMembersOfReview(reviewed, "verified").catch(() => undefined);
  revalidateReview(reviewed.map((r) => r.memberId));
  return { ok: true, count: reviewed.length };
}

/** Staff rejects a self-reported entry (wrong/implausible) — removes it and tells the socio. */
export async function rejectSelfEntry(kind: EntryKind, id: string, _memberId?: string): Promise<SelfLogResult> {
  const user = await requireAuth();
  if (!canReview(user, kind)) return { ok: false, error: "Sin permisos." };

  const [row] = await reviewableRows(user, kind, [id]);
  if (!row) return { ok: false, error: "Solo se descartan registros del socio que sigan sin validar." };

  if (kind === "measurement") {
    await prisma.bodyComposition.delete({ where: { id } });
  } else if (kind === "set") {
    await prisma.mainSetLog.delete({ where: { id } });
  } else {
    await prisma.testResult.delete({ where: { id } });
  }

  await notifyMembersOfReview([row], "rejected").catch(() => undefined);
  revalidateReview([row.memberId]);
  return { ok: true };
}

/**
 * Self-reported entries for a member, newest first — powers the validation panel
 * on the staff member profile. Staff-taken records are excluded (they need no
 * validation).
 */
export async function getMemberSelfEntries(memberId: string) {
  // Staff view on the socio ficha. A socio must not read another socio's data
  // through this id-based action.
  const user = await requireAuth();
  if (user.role === "MEMBER") throw new Error("Sin permisos");

  const [sets, comps, prs] = await Promise.all([
    prisma.mainSetLog.findMany({
      where: { memberId, source: "MEMBER" },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
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

  const mainSets = sets.map((s) => ({
    id: s.id,
    kind: "set" as const,
    at: fmt(s.createdAt),
    sortAt: s.createdAt.getTime(),
    summary: `Serie principal · ${s.exercise} — ${formatMainSet(s)} (1RM estimado ${estimate1Rm(s)} kg)`,
    notes: s.notes,
    verified: s.verifiedAt != null,
  }));

  return [...measurement, ...marks, ...mainSets]
    .sort((a, b) => b.sortAt - a.sortAt)
    .map(({ sortAt: _sortAt, ...rest }) => rest);
}
