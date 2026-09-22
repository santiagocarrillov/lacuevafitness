"use server";

import { revalidatePath } from "next/cache";
import { applyPlanToMember, linkMemberToLead } from "@/lib/member-lifecycle";
import { prisma } from "@/lib/prisma";
import { Sede, MemberStatus, MembershipState, PaymentMethod, PaymentStatus } from "@/generated/prisma/client";
import { headers } from "next/headers";
import { requireAuth, can } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createPasswordRecovery, sendPortalInviteEmail } from "@/lib/account/recovery";

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
  // Hide ONLY the empty auto-provisioned preview stubs (created so a staff
  // member can open the socio app without a real ficha): linked to a staff user,
  // still status LEAD, and with no memberships AND no attendance. Any staff
  // member who actually trains — has attendance, an evaluation, etc. — stays
  // visible so the nutritionist/coach can log their body comp and tests.
  where.NOT = {
    user: { role: { not: "MEMBER" } },
    status: "LEAD",
    memberships: { none: {} },
    attendance: { none: {} },
  };
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
        // Visits in the last 30 days → drives the attendance-frequency badge.
        _count: {
          select: { attendance: { where: { recordedAt: { gte: thirtyDaysAgo } } } },
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

    // Atarlo a su lead desde el minuto cero. Es la enfermedad de fondo: 1437 de
    // 1441 socios tenían leadId en null y el embudo vivía ciego a lo que pasaba
    // en el gimnasio.
    await prisma.$transaction(async (tx) => {
      await linkMemberToLead(tx, member.id);
    });

    revalidatePath("/dashboard/socios");
    revalidatePath("/dashboard/leads");
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

  // Email is @unique. Pre-check against OTHER members so a collision surfaces as a
  // clean message instead of an unhandled P2002 that crashes the socio page (bug #5).
  if (data.email) {
    const clash = await prisma.member.findUnique({
      where: { email: data.email },
      select: { id: true, firstName: true, lastName: true },
    });
    if (clash && clash.id !== id) {
      throw new Error(
        `Ya existe otro socio con el email ${data.email} (${clash.firstName} ${clash.lastName}).`,
      );
    }
  }

  try {
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
  } catch (err: unknown) {
    // Fallback for the race where the email is taken between the pre-check and update.
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      throw new Error("Ya existe otro socio con ese email o teléfono.");
    }
    throw err;
  }
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

  const membership = await prisma.$transaction(async (tx) => {
    const created = await tx.membership.create({
      data: {
        memberId: data.memberId,
        planId: data.planId,
        state: MembershipState.ACTIVE,
        startsAt,
        endsAt,
      },
    });

    // El estado lo decide el plan, no un ACTIVE fijo: las dos semanas de $9 son
    // evaluación, no una venta. Aquí también se ata el socio a su lead y se mueve
    // el embudo — antes el alta guardaba la venta y el embudo seguía mostrando cero.
    await applyPlanToMember(tx, data.memberId, plan.billingCycle);
    return created;
  });

  revalidatePath("/dashboard/socios");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/comunicacion");
  revalidatePath(`/dashboard/socios/${data.memberId}`);
  return membership;
}

// ── Renew membership (month-to-month) ────────────────────────────────
//
// Each renewal is its OWN membership record, chained after the previous one
// (startsAt = previous endsAt, or today if the socio already lapsed). The
// previous membership is marked EXPIRED so only one is ACTIVE at a time and the
// ficha shows a clean per-month history. Optionally registers the month's
// payment in the same step, linked to the new membership.
export async function renewMembership(data: {
  memberId: string;
  fromMembershipId: string;
  planId?: string; // defaults to the previous membership's plan
  customPriceCents?: number | null; // defaults to the previous membership's custom price
  startsAt?: string; // override; defaults to the chained date
  payment?: {
    amountCents: number;
    method: PaymentMethod;
    paidAt?: string;
    depositorName?: string;
    bankReference?: string;
    bankEntity?: string;
    notes?: string;
  };
}) {
  const user = await requireAuth();
  if (!can.editMembership(user)) throw new Error("No autorizado");

  const prev = await prisma.membership.findUniqueOrThrow({
    where: { id: data.fromMembershipId },
    include: { member: true },
  });
  if (prev.memberId !== data.memberId) throw new Error("Membresía no corresponde al socio");

  const planId = data.planId ?? prev.planId;
  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: planId } });

  // Chain without gaps: start when the previous one ends, unless the socio
  // already lapsed (endsAt in the past) — then start today.
  const now = new Date();
  const chainStart = new Date(prev.endsAt) > now ? new Date(prev.endsAt) : now;
  const startsAt = data.startsAt ? new Date(data.startsAt) : chainStart;
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + plan.durationDays);

  const customPriceCents =
    data.customPriceCents !== undefined ? data.customPriceCents : prev.customPriceCents;

  const membership = await prisma.$transaction(async (tx) => {
    // Close out the previous membership so only one is ACTIVE at a time.
    if (prev.state === MembershipState.ACTIVE) {
      await tx.membership.update({
        where: { id: prev.id },
        data: { state: MembershipState.EXPIRED },
      });
    }

    const created = await tx.membership.create({
      data: {
        memberId: data.memberId,
        planId,
        state: MembershipState.ACTIVE,
        customPriceCents,
        paymentMethod: prev.paymentMethod,
        startsAt,
        endsAt,
      },
    });

    // Renovar con un plan real convierte: es el paso de evaluación a socio activo,
    // que es justo la tasa que Santiago quiere medir.
    await applyPlanToMember(tx, data.memberId, plan.billingCycle);

    if (data.payment) {
      const isCash = data.payment.method === PaymentMethod.CASH;
      const status: PaymentStatus = isCash ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING;
      const paidAt = data.payment.paidAt
        ? new Date(data.payment.paidAt)
        : isCash
          ? new Date()
          : undefined;
      await tx.payment.create({
        data: {
          memberId: data.memberId,
          membershipId: created.id,
          amountCents: data.payment.amountCents,
          currency: "USD",
          method: data.payment.method,
          status,
          paidAt,
          depositorName: data.payment.depositorName || undefined,
          bankReference: data.payment.bankReference || undefined,
          bankEntity: data.payment.bankEntity || undefined,
          isPoolEntry: false,
          sede: prev.member.sede,
          recordedByUserId: user.id,
          notes: data.payment.notes || undefined,
        },
      });
    }

    return created;
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

// ── Portal account troubleshooting (admin) ──────────────────────────

/** Temporary password an admin hands over in person / by WhatsApp. Same
 *  unambiguous alphabet as the invite code — it gets dictated out loud. */
function randomTempPassword(): string {
  let pw = "";
  for (let i = 0; i < 10; i++) {
    pw += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return pw;
}

/**
 * Email the socio their current invite code. The admin still sees the code on
 * screen — WhatsApp is the channel that actually gets read — this is the
 * "reenviar invitación" shortcut for socios who do check email.
 */
export async function emailPortalInvite(
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAuth();
  if (!can.manageMembers(actor)) return { ok: false, error: "No autorizado." };

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      email: true, firstName: true, lastName: true,
      portalInviteCode: true, portalInviteCodeExpiresAt: true,
    },
  });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!member.email) return { ok: false, error: "El socio no tiene correo registrado." };
  if (!member.portalInviteCode || !member.portalInviteCodeExpiresAt) {
    return { ok: false, error: "Genera un código antes de enviarlo." };
  }

  const res = await sendPortalInviteEmail({
    email: member.email,
    code: member.portalInviteCode,
    expiresAt: member.portalInviteCodeExpiresAt,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
    origin: (await headers()).get("origin") ?? undefined,
  });

  if (!res.sent) return { ok: false, error: res.error ?? "No se pudo enviar el correo." };
  return { ok: true };
}

export type MemberAccessResult =
  | { ok: true; password: string }
  | { ok: false; error: string };

/**
 * Set a temporary password on a socio's account so an admin can unblock them on
 * the spot. Returns it once, to be read out or pasted into WhatsApp; the socio
 * changes it later from Mi cuenta. Their previous password stops working.
 */
export async function resetMemberPassword(memberId: string): Promise<MemberAccessResult> {
  const actor = await requireAuth();
  if (!can.manageMembers(actor)) return { ok: false, error: "No autorizado." };

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { user: { select: { id: true, role: true, supabaseUserId: true } } },
  });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!member.user?.supabaseUserId) {
    return { ok: false, error: "Este socio todavía no activó la app. Envíale una invitación." };
  }
  // Staff accounts are managed in Usuarios by the owner — never from a socio ficha.
  if (member.user.role !== "MEMBER" && !can.manageUsers(actor)) {
    return { ok: false, error: "Esta cuenta es de staff. Pide a Santiago que la resetee." };
  }

  const password = randomTempPassword();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(member.user.supabaseUserId, {
    password,
    email_confirm: true,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, password };
}

export type RecoveryLinkResult =
  | { ok: true; link: string; emailed: boolean }
  | { ok: false; error: string };

/**
 * Send the socio a recovery link by email and hand the same link to the admin,
 * so it can also go out by WhatsApp. Lets the socio pick their own password
 * instead of receiving one — the preferred path when they do have email.
 */
export async function sendMemberRecoveryLink(memberId: string): Promise<RecoveryLinkResult> {
  const actor = await requireAuth();
  if (!can.manageMembers(actor)) return { ok: false, error: "No autorizado." };

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      email: true, firstName: true, lastName: true,
      user: { select: { role: true, supabaseUserId: true } },
    },
  });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!member.email) return { ok: false, error: "El socio no tiene correo registrado." };
  if (!member.user?.supabaseUserId) {
    return { ok: false, error: "Este socio todavía no activó la app. Envíale una invitación." };
  }
  if (member.user.role !== "MEMBER" && !can.manageUsers(actor)) {
    return { ok: false, error: "Esta cuenta es de staff. Pide a Santiago que la resetee." };
  }

  const res = await createPasswordRecovery(member.email, {
    origin: (await headers()).get("origin") ?? undefined,
    memberName: `${member.firstName} ${member.lastName}`.trim(),
  });
  if (!res.ok) return { ok: false, error: res.error };

  return { ok: true, link: res.link, emailed: res.emailed };
}

/**
 * Detach the socio's app account so a fresh invite code can be issued — the fix
 * when the ficha was linked to the wrong email or the socio lost that inbox for
 * good. The User row is deactivated (never deleted, per the soft-delete rule) so
 * the stale login stops working; history stays attached to the Member.
 */
export async function unlinkMemberAccount(
  memberId: string,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAuth();
  if (!can.manageMembers(actor)) return { ok: false, error: "No autorizado." };

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { user: { select: { id: true, role: true } } },
  });
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!member.user) return { ok: false, error: "Este socio no tiene cuenta vinculada." };
  if (member.user.role !== "MEMBER") {
    return { ok: false, error: "Es una cuenta de staff. Gestiónala en Usuarios." };
  }

  await prisma.$transaction([
    prisma.member.update({
      where: { id: memberId },
      data: { userId: null, portalInviteCode: null, portalInviteCodeExpiresAt: null },
    }),
    prisma.user.update({ where: { id: member.user.id }, data: { active: false } }),
  ]);

  revalidatePath(`/dashboard/socios/${memberId}`);
  return { ok: true };
}
