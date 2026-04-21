"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, LeadSource, LeadStage, MemberStatus } from "@/generated/prisma/client";

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
  const where: any = {};
  if (sede) where.sede = sede;
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

// ── Update lead stage ───────────────────────────────────────────────

export async function updateLeadStage(id: string, stage: LeadStage) {
  const updates: any = { stage };

  if (stage === LeadStage.CONVERTED) {
    updates.convertedAt = new Date();
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: updates,
  });

  revalidatePath("/dashboard/leads");
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
  },
) {
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...data,
      trialScheduledAt: data.trialScheduledAt
        ? new Date(data.trialScheduledAt)
        : undefined,
    },
  });

  revalidatePath("/dashboard/leads");
  return lead;
}

// ── Add interaction ─────────────────────────────────────────────────

export async function addLeadInteraction(data: {
  leadId: string;
  userId?: string;
  channel: LeadSource;
  summary: string;
}) {
  const interaction = await prisma.leadInteraction.create({
    data: {
      leadId: data.leadId,
      userId: data.userId || undefined,
      channel: data.channel,
      summary: data.summary,
    },
  });

  revalidatePath("/dashboard/leads");
  return interaction;
}

// ── Convert lead to member ──────────────────────────────────────────

export async function convertLeadToMember(
  leadId: string,
  planId: string,
) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
  });

  // Create member from lead data
  const member = await prisma.member.create({
    data: {
      firstName: lead.firstName,
      lastName: lead.lastName ?? "",
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      sede: lead.sede,
      status: MemberStatus.ACTIVE,
      leadId: lead.id,
    },
  });

  // Assign membership
  const plan = await prisma.membershipPlan.findUniqueOrThrow({
    where: { id: planId },
  });
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + plan.durationDays);

  await prisma.membership.create({
    data: {
      memberId: member.id,
      planId,
      state: "ACTIVE",
      startsAt: now,
      endsAt,
    },
  });

  // Update lead stage
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      stage: LeadStage.CONVERTED,
      convertedAt: now,
    },
  });

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/socios");
  return member;
}

// ── Pipeline stats ──────────────────────────────────────────────────

export async function getLeadStats(sede?: Sede) {
  const sedeFilter = sede ? { sede } : {};

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
  return prisma.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN"] }, active: true },
    select: { id: true, fullName: true, sede: true },
    orderBy: { fullName: "asc" },
  });
}
