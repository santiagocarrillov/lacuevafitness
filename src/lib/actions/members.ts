"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, MemberStatus, MembershipState, BillingCycle } from "@/generated/prisma/client";

// ── List / Search ───────────────────────────────────────────────────

export async function getMembers({
  sede,
  status,
  search,
  page = 1,
  pageSize = 50,
}: {
  sede?: Sede;
  status?: MemberStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const where: any = {};
  if (sede) where.sede = sede;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        memberships: {
          orderBy: { endsAt: "desc" },
          take: 1,
          include: { plan: true },
        },
      },
    }),
    prisma.member.count({ where }),
  ]);

  return {
    members,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ── Get single member ───────────────────────────────────────────────

export async function getMember(id: string) {
  return prisma.member.findUnique({
    where: { id },
    include: {
      memberships: {
        orderBy: { startsAt: "desc" },
        include: { plan: true, payments: { orderBy: { paidAt: "desc" } } },
      },
      attendance: {
        orderBy: { recordedAt: "desc" },
        take: 20,
        include: { classSession: { include: { schedule: true } } },
      },
      evaluations: { orderBy: { startedAt: "desc" }, take: 5 },
      bodyCompositions: { orderBy: { measuredAt: "desc" }, take: 5 },
      testResults: { orderBy: { recordedAt: "desc" }, take: 20 },
      trainingLevels: { orderBy: { assignedAt: "desc" }, take: 1 },
      goals: { orderBy: { createdAt: "desc" } },
      lead: true,
    },
  });
}

// ── Create ──────────────────────────────────────────────────────────

export async function createMember(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  sede: Sede;
  status?: MemberStatus;
  notes?: string;
}) {
  const member = await prisma.member.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || undefined,
      phone: data.phone || undefined,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      emergencyName: data.emergencyName || undefined,
      emergencyPhone: data.emergencyPhone || undefined,
      sede: data.sede,
      status: data.status ?? MemberStatus.ACTIVE,
      notes: data.notes || undefined,
    },
  });

  revalidatePath("/dashboard/socios");
  return member;
}

// ── Update ──────────────────────────────────────────────────────────

export async function updateMember(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    sede?: Sede;
    status?: MemberStatus;
    notes?: string;
  },
) {
  const member = await prisma.member.update({
    where: { id },
    data: {
      ...data,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
    },
  });

  revalidatePath("/dashboard/socios");
  revalidatePath(`/dashboard/socios/${id}`);
  return member;
}

// ── Deactivate (churn) ──────────────────────────────────────────────

export async function churnMember(id: string, reason?: string) {
  await prisma.member.update({
    where: { id },
    data: {
      status: MemberStatus.CHURNED,
      churnedAt: new Date(),
      churnReason: reason,
    },
  });

  // Cancel active memberships
  await prisma.membership.updateMany({
    where: { memberId: id, state: MembershipState.ACTIVE },
    data: { state: MembershipState.CANCELED, canceledAt: new Date() },
  });

  revalidatePath("/dashboard/socios");
  revalidatePath(`/dashboard/socios/${id}`);
}

// ── Reactivate ──────────────────────────────────────────────────────

export async function reactivateMember(id: string) {
  await prisma.member.update({
    where: { id },
    data: {
      status: MemberStatus.ACTIVE,
      churnedAt: null,
      churnReason: null,
    },
  });

  revalidatePath("/dashboard/socios");
  revalidatePath(`/dashboard/socios/${id}`);
}

// ── Assign membership ───────────────────────────────────────────────

export async function assignMembership(data: {
  memberId: string;
  planId: string;
  startsAt?: string;
}) {
  const plan = await prisma.membershipPlan.findUniqueOrThrow({
    where: { id: data.planId },
  });

  const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + plan.durationDays);

  const membership = await prisma.membership.create({
    data: {
      memberId: data.memberId,
      planId: data.planId,
      state: MembershipState.ACTIVE,
      startsAt,
      endsAt,
    },
  });

  // Ensure member status is active
  await prisma.member.update({
    where: { id: data.memberId },
    data: { status: MemberStatus.ACTIVE },
  });

  revalidatePath("/dashboard/socios");
  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return membership;
}

// ── Get membership plans ────────────────────────────────────────────

export async function getMembershipPlans() {
  return prisma.membershipPlan.findMany({
    where: { active: true },
    orderBy: { durationDays: "asc" },
  });
}

// ── Stats ───────────────────────────────────────────────────────────

export async function getMemberStats(sede?: Sede) {
  const sedeFilter = sede ? { sede } : {};

  const [total, active, trial, paused, churned] = await Promise.all([
    prisma.member.count({ where: sedeFilter }),
    prisma.member.count({ where: { ...sedeFilter, status: MemberStatus.ACTIVE } }),
    prisma.member.count({ where: { ...sedeFilter, status: MemberStatus.TRIAL } }),
    prisma.member.count({ where: { ...sedeFilter, status: MemberStatus.PAUSED } }),
    prisma.member.count({ where: { ...sedeFilter, status: MemberStatus.CHURNED } }),
  ]);

  return { total, active, trial, paused, churned };
}
