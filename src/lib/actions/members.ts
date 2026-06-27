"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Sede, MemberStatus, MembershipState, BillingCycle } from "@/generated/prisma/client";
import { requireAuth, can } from "@/lib/auth";

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
        include: { plan: true },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        take: 30,
        include: { membership: { include: { plan: true } } },
      },
      attendance: {
        orderBy: { recordedAt: "desc" },
        take: 20,
        include: { classSession: { include: { schedule: true } } },
      },
      evaluations: { orderBy: { startedAt: "desc" }, take: 5 },
      bodyCompositions: {
        orderBy: { measuredAt: "desc" },
        include: { recordedBy: { select: { fullName: true } } },
      },
      clinicalMarkers: {
        orderBy: { measuredAt: "desc" },
        include: { recordedBy: { select: { fullName: true } } },
      },
      testResults: { orderBy: { recordedAt: "desc" }, take: 20 },
      trainingLevels: { orderBy: { assignedAt: "desc" }, take: 1 },
      goals: { orderBy: { createdAt: "desc" } },
      lead: { include: { interactions: { orderBy: { occurredAt: "desc" }, take: 5 } } },
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
  address?: string;
  occupation?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  sede: Sede;
  secondarySede?: Sede | null;
  status?: MemberStatus;
  notes?: string;
}) {
  // Pre-check email uniqueness for a friendly error
  if (data.email) {
    const existing = await prisma.member.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new Error(`Ya existe un socio con el email ${data.email} (${existing.firstName} ${existing.lastName}).`);
    }
  }

  try {
    const member = await prisma.member.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone || undefined,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        address: data.address || undefined,
        occupation: data.occupation || undefined,
        emergencyName: data.emergencyName || undefined,
        emergencyPhone: data.emergencyPhone || undefined,
        sede: data.sede,
        secondarySede: data.secondarySede && data.secondarySede !== data.sede ? data.secondarySede : undefined,
        status: data.status ?? MemberStatus.ACTIVE,
        notes: data.notes || undefined,
      },
    });

    revalidatePath("/dashboard/socios");
    return member;
  } catch (err: unknown) {
    // Surface unique constraint as a clean message
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      throw new Error("Ya existe un socio con ese email o teléfono.");
    }
    throw err;
  }
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
    address?: string;
    occupation?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    sede?: Sede;
    secondarySede?: Sede | null;
    status?: MemberStatus;
    notes?: string;
  },
) {
  const { secondarySede, ...rest } = data;
  const member = await prisma.member.update({
    where: { id },
    data: {
      ...rest,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      email: data.email || undefined,
      phone: data.phone || undefined,
      // Secondary sede is attendance-only; never equal to the primary.
      ...(secondarySede !== undefined
        ? { secondarySede: secondarySede && secondarySede !== data.sede ? secondarySede : null }
        : {}),
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

// ── Portal invite codes ─────────────────────────────────────────────

/** Days an issued invite code stays valid before the socio must be re-invited.
 *  Module-local: a "use server" file may only export async functions. */
const PORTAL_INVITE_TTL_DAYS = 14;

// Unambiguous alphabet (no 0/O, 1/I/L) — the code is typed by hand on a phone.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomInviteCode(): string {
  let raw = "";
  for (let i = 0; i < 8; i++) {
    raw += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  // Grouped for readability: ABCD-2345. Stored with the dash so what the admin
  // copies is exactly what the socio types.
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export type PortalInviteResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; error: string };

/**
 * Issue (or re-issue) a one-time portal invite code for a socio. Admin-only.
 * The code is returned once for the admin to send (e.g. WhatsApp); the socio
 * redeems it at /portal/signup. Regenerating replaces any prior unused code.
 */
export async function generatePortalInvite(memberId: string): Promise<PortalInviteResult> {
  const actor = await requireAuth();
  if (!can.manageMembers(actor)) return { ok: false, error: "No autorizado." };

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, email: true, userId: true },
  });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (member.userId) {
    return { ok: false, error: "Este socio ya tiene la app activa." };
  }
  if (!member.email) {
    return { ok: false, error: "El socio no tiene email. Agrega uno antes de invitar." };
  }

  const expiresAt = new Date(Date.now() + PORTAL_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Retry on the (rare) unique-collision so a clash never surfaces to the admin.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomInviteCode();
    try {
      await prisma.member.update({
        where: { id: memberId },
        data: { portalInviteCode: code, portalInviteCodeExpiresAt: expiresAt },
      });
      revalidatePath(`/dashboard/socios/${memberId}`);
      return { ok: true, code, expiresAt: expiresAt.toISOString() };
    } catch (err: unknown) {
      // P2002 = unique constraint failed → collided code, try again.
      if (typeof err === "object" && err && "code" in err && (err as { code?: string }).code === "P2002") {
        continue;
      }
      throw err;
    }
  }
  return { ok: false, error: "No se pudo generar el código. Intenta de nuevo." };
}

/** Cancel an outstanding invite code so it can no longer be redeemed. Admin-only. */
export async function revokePortalInvite(memberId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAuth();
  if (!can.manageMembers(actor)) return { ok: false, error: "No autorizado." };

  await prisma.member.update({
    where: { id: memberId },
    data: { portalInviteCode: null, portalInviteCodeExpiresAt: null },
  });
  revalidatePath(`/dashboard/socios/${memberId}`);
  return { ok: true };
}
