"use server";

import { revalidatePath } from "next/cache";
import { applyPlanToMember } from "@/lib/member-lifecycle";
import { prisma } from "@/lib/prisma";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { Sede, LeadSource, LeadStage, type User } from "@/generated/prisma/client";
import { STAGE_LABEL } from "@/lib/leads/stages";

// ── Guards ──────────────────────────────────────────────────────────
// Server actions are public POST endpoints: every export checks its caller.

async function requireLeadManager(): Promise<User> {
  const user = await requireAuth();
  if (!can.manageLeads(user)) throw new Error("No autorizado");
  return user;
}

/** Scoped admins only touch leads of their own sede. */
async function assertLeadInScope(user: User, leadId: string) {
  const scope = getSedeScope(user);
  if (!scope) return;
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { sede: true } });
  if (!lead) throw new Error("Lead no encontrado");
  if (lead.sede !== scope) throw new Error("No autorizado");
}

// ── List / Search ───────────────────────────────────────────────────

export async function getLeads({
  sede,
  stage,
  source,
  search,
  page = 1,
  pageSize = 50,
}: {
  sede?: Sede;
  stage?: LeadStage;
  source?: LeadSource;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const user = await requireLeadManager();
  const effectiveSede = getSedeScope(user) ?? sede;

  const where: any = {};
  if (effectiveSede) where.sede = effectiveSede;
  if (stage) where.stage = stage;
  if (source) where.source = source;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        owner: { select: { fullName: true } },
        interactions: { orderBy: { occurredAt: "desc" }, take: 1 },
        member: { select: { id: true, status: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    leads,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ── Create lead ─────────────────────────────────────────────────────

export async function createLead(data: {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  sede: Sede;
  source: LeadSource;
  notes?: string;
  ownerUserId?: string;
}) {
  const user = await requireLeadManager();
  const scope = getSedeScope(user);
  if (scope && data.sede !== scope) throw new Error("Solo puedes crear leads de tu sede.");

  const lead = await prisma.lead.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName || undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      sede: data.sede,
      source: data.source,
      notes: data.notes || undefined,
      ownerUserId: data.ownerUserId || undefined,
    },
  });

  revalidatePath("/dashboard/leads");
  return lead;
}

// ── Ficha ───────────────────────────────────────────────────────────

/** Un lead para su ficha. Admins con sede solo ven los de su sede. */
export async function getLead(id: string) {
  const user = await requireLeadManager();
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, fullName: true } },
      member: { select: { id: true } },
      conversation: { select: { id: true, botPaused: true, lastInboundAt: true, lastOutboundAt: true } },
      interactions: { orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } },
    },
  });
  if (!lead) return null;
  const scope = getSedeScope(user);
  if (scope && lead.sede !== scope) return null;
  return lead;
}

// ── Update lead stage ───────────────────────────────────────────────

export async function updateLeadStage(id: string, stage: LeadStage) {
  const user = await requireLeadManager();
  await assertLeadInScope(user, id);

  const updates: any = { stage };

  if (stage === LeadStage.CONVERTED) {
    updates.convertedAt = new Date();
  }

  const before = await prisma.lead.findUniqueOrThrow({ where: { id }, select: { stage: true } });
  const lead = await prisma.lead.update({
    where: { id },
    data: updates,
  });
  // Cada cambio de etapa queda en la actividad de la ficha, con quién lo hizo.
  if (before.stage !== stage) {
    await prisma.leadInteraction.create({
      data: {
        leadId: id,
        userId: user.id,
        channel: "OTHER",
        summary: `Etapa: ${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[stage]}.`,
      },
    });
  }

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${id}`);
  return lead;
}

// ── Update lead ─────────────────────────────────────────────────────

export async function updateLead(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    stage?: LeadStage;
    source?: LeadSource;
    notes?: string;
    lostReason?: string;
    trialScheduledAt?: string;
    trialAttended?: boolean;
    ownerUserId?: string | null;
  },
) {
  const user = await requireLeadManager();
  await assertLeadInScope(user, id);
  if (data.ownerUserId) {
    const owner = await prisma.user.findUnique({ where: { id: data.ownerUserId }, select: { role: true } });
    if (!owner || owner.role === "MEMBER") throw new Error("Responsable no válido");
  }

  // Un campo vaciado en el formulario se guarda como null, no como "".
  const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...data,
      lastName: blank(data.lastName),
      email: blank(data.email),
      phone: blank(data.phone),
      notes: blank(data.notes),
      lostReason: blank(data.lostReason),
      trialScheduledAt: data.trialScheduledAt
        ? new Date(data.trialScheduledAt)
        : undefined,
    },
  });

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${id}`);
  return lead;
}

// ── Add interaction ─────────────────────────────────────────────────

export async function addLeadInteraction(data: {
  leadId: string;
  channel: LeadSource;
  summary: string;
}) {
  const user = await requireLeadManager();
  await assertLeadInScope(user, data.leadId);
  const summary = data.summary.trim().slice(0, 4000);
  if (!summary) throw new Error("Escribe qué pasó.");

  const interaction = await prisma.leadInteraction.create({
    data: {
      leadId: data.leadId,
      // El autor es quien está en sesión, nunca lo que mande el cliente.
      userId: user.id,
      channel: data.channel,
      summary,
    },
  });

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${data.leadId}`);
  return interaction;
}

// ── Convert lead to member ──────────────────────────────────────────

export async function convertLeadToMember(
  leadId: string,
  planId: string,
) {
  const user = await requireLeadManager();
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
  });
  const scope = getSedeScope(user);
  if (scope && lead.sede !== scope) throw new Error("No autorizado");

  const plan = await prisma.membershipPlan.findUniqueOrThrow({
    where: { id: planId },
  });
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + plan.durationDays);

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.member.create({
      data: {
        firstName: lead.firstName,
        lastName: lead.lastName ?? "",
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        sede: lead.sede,
        // Sin estado explícito: lo pone applyPlanToMember según el plan. Antes
        // era ACTIVE fijo, así que comprar las dos semanas de $9 daba un socio
        // activo y contaminaba el KPI.
        leadId: lead.id,
      },
    });

    await tx.membership.create({
      data: {
        memberId: created.id,
        planId,
        state: "ACTIVE",
        startsAt: now,
        endsAt,
      },
    });

    // Pone el estado del socio y mueve el embudo a la etapa que corresponda:
    // "En evaluación" con el trial, "Socio activo" con una mensualidad real.
    await applyPlanToMember(tx, created.id, plan.billingCycle);
    return created;
  });

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/socios");
  revalidatePath("/dashboard/comunicacion");
  return member;
}

// ── Pipeline stats ──────────────────────────────────────────────────

export async function getLeadStats(sede?: Sede) {
  const user = await requireLeadManager();
  const effectiveSede = getSedeScope(user) ?? sede;
  const sedeFilter = effectiveSede ? { sede: effectiveSede } : {};

  const stages = await prisma.lead.groupBy({
    by: ["stage"],
    where: sedeFilter,
    _count: true,
  });

  const sources = await prisma.lead.groupBy({
    by: ["source"],
    where: sedeFilter,
    _count: true,
  });

  // Conversion rates
  const totalLeads = await prisma.lead.count({ where: sedeFilter });
  const converted = await prisma.lead.count({
    where: { ...sedeFilter, stage: LeadStage.CONVERTED },
  });
  const lost = await prisma.lead.count({
    where: { ...sedeFilter, stage: LeadStage.LOST },
  });

  // This month's new leads
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = await prisma.lead.count({
    where: { ...sedeFilter, createdAt: { gte: monthStart } },
  });

  return {
    stages: Object.fromEntries(stages.map((s) => [s.stage, s._count])),
    sources: Object.fromEntries(sources.map((s) => [s.source, s._count])),
    totalLeads,
    converted,
    lost,
    conversionRate: totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0,
    thisMonth,
  };
}

// ── Get staff for owner assignment ──────────────────────────────────

export async function getStaffUsers() {
  await requireLeadManager();
  return prisma.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN"] }, active: true },
    select: { id: true, fullName: true, sede: true },
    orderBy: { fullName: "asc" },
  });
}
