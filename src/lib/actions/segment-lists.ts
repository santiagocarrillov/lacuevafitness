"use server";

/**
 * Listas manuales de personas (segmentos que arma el staff) y, para la ficha,
 * en qué segmentos automáticos cae un socio. Ver `Segment` en el schema.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import type { Sede, User } from "@/generated/prisma/client";
import type { SegmentKey } from "./analytics";

type Person = { kind: "lead" | "member"; id: string };
type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function requireSegmentUser(): Promise<User> {
  const user = await requireAuth();
  if (!can.viewSegments(user)) throw new Error("No autorizado");
  return user;
}

/** Admins con sede ven las listas de su sede y las de ambas. */
function visibleWhere(user: User) {
  const scope = getSedeScope(user);
  return { archivedAt: null, ...(scope ? { OR: [{ sede: null }, { sede: scope }] } : {}) };
}

async function personSede(person: Person): Promise<Sede | null> {
  if (person.kind === "member") {
    const m = await prisma.member.findUnique({ where: { id: person.id }, select: { sede: true } });
    return m?.sede ?? null;
  }
  const l = await prisma.lead.findUnique({ where: { id: person.id }, select: { sede: true } });
  return l?.sede ?? null;
}

function revalidatePerson(person: Person) {
  revalidatePath(person.kind === "member" ? `/dashboard/socios/${person.id}` : `/dashboard/leads/${person.id}`);
  revalidatePath("/dashboard/segmentos");
}

export type SegmentOption = { id: string; name: string; sede: Sede | null; count: number };

/** Las listas activas que este usuario puede usar, con cuántas personas tiene cada una. */
export async function listSegments(): Promise<SegmentOption[]> {
  const user = await requireSegmentUser();
  const rows = await prisma.segment.findMany({
    where: visibleWhere(user),
    orderBy: { name: "asc" },
    select: { id: true, name: true, sede: true, _count: { select: { entries: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, sede: r.sede, count: r._count.entries }));
}

export type PersonSegment = { entryId: string; segmentId: string; name: string; addedBy: string | null; addedAt: string };

/**
 * Las listas en las que está una persona. Para un socio cuenta también lo que
 * se agregó cuando todavía era lead (una persona, una historia).
 */
export async function getPersonSegments(person: Person, leadIdOfMember?: string | null): Promise<PersonSegment[]> {
  const user = await requireSegmentUser();
  const who =
    person.kind === "member"
      ? { OR: [{ memberId: person.id }, ...(leadIdOfMember ? [{ leadId: leadIdOfMember }] : [])] }
      : { leadId: person.id };
  const rows = await prisma.segmentEntry.findMany({
    where: { ...who, segment: visibleWhere(user) },
    orderBy: { createdAt: "asc" },
    include: { segment: { select: { id: true, name: true } }, addedBy: { select: { fullName: true } } },
  });
  // A socio could be in the same list twice (once as lead, once as socio): show it once.
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.segmentId) ? false : (seen.add(r.segmentId), true)))
    .map((r) => ({
      entryId: r.id,
      segmentId: r.segment.id,
      name: r.segment.name,
      addedBy: r.addedBy?.fullName ?? null,
      addedAt: r.createdAt.toISOString(),
    }));
}

/** Agregar a una lista existente o, con `newName`, crear la lista y agregar. */
export async function addPersonToSegment(
  person: Person,
  target: { segmentId: string } | { newName: string; allSedes?: boolean },
): Promise<Result> {
  const user = await requireSegmentUser();
  const scope = getSedeScope(user);
  const sede = await personSede(person);
  if (!sede) return { ok: false, error: "No se encontró a la persona." };
  if (scope && sede !== scope) return { ok: false, error: "Esta persona es de otra sede." };

  let segmentId: string;
  if ("segmentId" in target) {
    const seg = await prisma.segment.findFirst({ where: { id: target.segmentId, ...visibleWhere(user) }, select: { id: true } });
    if (!seg) return { ok: false, error: "Esa lista no existe o no la puedes usar." };
    segmentId = seg.id;
  } else {
    const name = target.newName.trim().slice(0, 80);
    if (!name) return { ok: false, error: "Escribe el nombre de la lista." };
    const existing = await prisma.segment.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, ...visibleWhere(user) },
      select: { id: true },
    });
    segmentId =
      existing?.id ??
      (
        await prisma.segment.create({
          // A scoped admin's new list belongs to their sede; the owner's to both.
          data: { name, sede: scope ?? (target.allSedes === false ? sede : null), createdById: user.id },
          select: { id: true },
        })
      ).id;
  }

  const owner = person.kind === "member" ? { memberId: person.id } : { leadId: person.id };
  const already = await prisma.segmentEntry.findFirst({ where: { segmentId, ...owner }, select: { id: true } });
  if (!already) {
    await prisma.segmentEntry.create({ data: { segmentId, ...owner, addedById: user.id } });
  }
  revalidatePerson(person);
  return { ok: true };
}

/** Sacar a una persona de una lista (borra el vínculo, no la lista). */
export async function removeSegmentEntry(entryId: string, person: Person): Promise<Result> {
  const user = await requireSegmentUser();
  const entry = await prisma.segmentEntry.findFirst({
    where: { id: entryId, segment: visibleWhere(user) },
    select: { id: true, segmentId: true, leadId: true, memberId: true },
  });
  if (!entry) return { ok: false, error: "No se encontró." };
  const scope = getSedeScope(user);
  if (scope && (await personSede(person)) !== scope) return { ok: false, error: "Esta persona es de otra sede." };
  // A socio added while still a lead: remove both links, so the list stops showing them.
  const member = person.kind === "member" ? await prisma.member.findUnique({ where: { id: person.id }, select: { leadId: true } }) : null;
  await prisma.segmentEntry.deleteMany({
    where: {
      segmentId: entry.segmentId,
      OR:
        person.kind === "member"
          ? [{ memberId: person.id }, ...(member?.leadId ? [{ leadId: member.leadId }] : [])]
          : [{ leadId: person.id }],
    },
  });
  revalidatePerson(person);
  return { ok: true };
}

/** Archivar una lista (nunca se borra). */
export async function archiveSegment(segmentId: string): Promise<Result> {
  const user = await requireSegmentUser();
  const seg = await prisma.segment.findFirst({ where: { id: segmentId, ...visibleWhere(user) }, select: { id: true } });
  if (!seg) return { ok: false, error: "No se encontró la lista." };
  await prisma.segment.update({ where: { id: seg.id }, data: { archivedAt: new Date() } });
  revalidatePath("/dashboard/segmentos");
  return { ok: true };
}

export type SegmentPersonRow = {
  kind: "lead" | "member";
  id: string;
  name: string;
  sede: Sede;
  status: string;
  phone: string | null;
  addedAt: string;
  addedBy: string | null;
};

/** Una lista con su gente; el lead que ya es socio aparece como socio. */
export async function getSegmentDetail(segmentId: string) {
  const user = await requireSegmentUser();
  const seg = await prisma.segment.findFirst({
    where: { id: segmentId, ...visibleWhere(user) },
    include: {
      createdBy: { select: { fullName: true } },
      entries: {
        orderBy: { createdAt: "desc" },
        include: {
          addedBy: { select: { fullName: true } },
          member: { select: { id: true, firstName: true, lastName: true, sede: true, status: true, phone: true } },
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              sede: true,
              stage: true,
              phone: true,
              member: { select: { id: true, firstName: true, lastName: true, sede: true, status: true, phone: true } },
            },
          },
        },
      },
    },
  });
  if (!seg) return null;
  const seen = new Set<string>();
  const people: SegmentPersonRow[] = [];
  for (const e of seg.entries) {
    const m = e.member ?? e.lead?.member ?? null;
    const row: SegmentPersonRow | null = m
      ? { kind: "member", id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), sede: m.sede, status: m.status, phone: m.phone, addedAt: e.createdAt.toISOString(), addedBy: e.addedBy?.fullName ?? null }
      : e.lead
        ? { kind: "lead", id: e.lead.id, name: `${e.lead.firstName} ${e.lead.lastName ?? ""}`.trim(), sede: e.lead.sede, status: e.lead.stage, phone: e.lead.phone, addedAt: e.createdAt.toISOString(), addedBy: e.addedBy?.fullName ?? null }
        : null;
    if (!row || seen.has(`${row.kind}:${row.id}`)) continue;
    seen.add(`${row.kind}:${row.id}`);
    people.push(row);
  }
  return {
    id: seg.id,
    name: seg.name,
    description: seg.description,
    sede: seg.sede,
    createdBy: seg.createdBy?.fullName ?? null,
    createdAt: seg.createdAt.toISOString(),
    people,
  };
}

/**
 * En cuáles de los segmentos automáticos cae este socio hoy. Mismas reglas que
 * `segmentMembersCore` en analytics.ts, calculadas para una sola persona (allá
 * se recorren todos los socios por cada segmento).
 */
export async function getMemberAutoSegments(memberId: string): Promise<SegmentKey[]> {
  await requireSegmentUser();
  const now = Date.now();
  const day = 86_400_000;
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { status: true, joinedAt: true },
  });
  if (!member || (member.status !== "ACTIVE" && member.status !== "TRIAL")) return [];

  const [stats] = await prisma.$queryRaw<
    { att28: bigint; att90: bigint; last: Date | null; morning: bigint; afternoon: bigint; evening: bigint }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE a."recordedAt" >= ${new Date(now - 28 * day)}) AS att28,
      COUNT(*) FILTER (WHERE a."recordedAt" >= ${new Date(now - 90 * day)}) AS att90,
      MAX(a."recordedAt") AS last,
      COUNT(*) FILTER (WHERE a."recordedAt" >= ${new Date(now - 60 * day)} AND EXTRACT(HOUR FROM cs."startAt") < 12) AS morning,
      COUNT(*) FILTER (WHERE a."recordedAt" >= ${new Date(now - 60 * day)} AND EXTRACT(HOUR FROM cs."startAt") >= 12 AND EXTRACT(HOUR FROM cs."startAt") < 17) AS afternoon,
      COUNT(*) FILTER (WHERE a."recordedAt" >= ${new Date(now - 60 * day)} AND EXTRACT(HOUR FROM cs."startAt") >= 17) AS evening
    FROM "Attendance" a
    JOIN "ClassSession" cs ON cs.id = a."classSessionId"
    WHERE a."memberId" = ${memberId}
  `;
  const [activeNow, expiringSoon] = await Promise.all([
    prisma.membership.count({ where: { memberId, state: "ACTIVE", endsAt: { gte: new Date(now) } } }),
    prisma.membership.count({ where: { memberId, state: "ACTIVE", endsAt: { gte: new Date(now), lte: new Date(now + 7 * day) } } }),
  ]);

  const out: SegmentKey[] = [];
  const last = stats?.last ? stats.last.getTime() : null;
  if (last != null) {
    const days = (now - last) / day;
    if (days >= 7 && days <= 14) out.push("at_risk");
    else if (days >= 14 && days <= 30) out.push("high_risk");
    else if (days >= 30 && days <= 365) out.push("ghost");
  }
  if (expiringSoon > 0) out.push("expiring_soon");
  if (activeNow === 0) out.push("expired_no_renewal");
  if (Number(stats?.att28 ?? 0) <= 2) out.push("low_attendance");
  if (Number(stats?.att90 ?? 0) >= 48 && member.joinedAt.getTime() <= now - 90 * day) out.push("champions");
  if (Number(stats?.morning ?? 0) >= 5) out.push("morning_members");
  if (Number(stats?.afternoon ?? 0) >= 5) out.push("afternoon_members");
  if (Number(stats?.evening ?? 0) >= 5) out.push("evening_members");
  return out;
}

/** Crear una lista vacía desde la página de Segmentos. */
export async function createSegment(input: { name: string; description?: string }): Promise<Result<{ id: string }>> {
  const user = await requireSegmentUser();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Escribe el nombre de la lista." };
  const existing = await prisma.segment.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...visibleWhere(user) },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "Ya hay una lista con ese nombre." };
  const seg = await prisma.segment.create({
    data: {
      name,
      description: input.description?.trim().slice(0, 300) || null,
      sede: getSedeScope(user),
      createdById: user.id,
    },
    select: { id: true },
  });
  revalidatePath("/dashboard/segmentos");
  return { ok: true, data: { id: seg.id } };
}
