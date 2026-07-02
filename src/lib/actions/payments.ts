"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import type { Sede, PaymentMethod, PaymentStatus } from "@/generated/prisma/client";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Admins can also manage payments for their sede */
function canManagePayments(user: { role: string }) {
  return (
    user.role === "OWNER" ||
    user.role === "ACCOUNTING" ||
    user.role === "ADMIN"
  );
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * All confirmed member payments (isPoolEntry = false, status = SUCCEEDED).
 * Also includes PENDING member payments so the admin can see "fondos sin depositar".
 */
export async function getMemberPayments({
  sede,
  page = 1,
  pageSize = 50,
  statusFilter,
}: {
  sede?: Sede;
  page?: number;
  pageSize?: number;
  statusFilter?: PaymentStatus;
} = {}) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const scopedSede = getSedeScope(user);
  const effectiveSede = scopedSede ?? sede;

  const where: any = {
    isPoolEntry: false,
    memberId: { not: null },
  };
  if (effectiveSede) where.sede = effectiveSede;
  if (statusFilter) where.status = statusFilter;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
        membership: { include: { plan: { select: { name: true } } } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return { payments, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * Isabel's pool entries — unassigned bank transactions.
 */
export async function getPoolEntries(sedeFilter?: Sede) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const scopedSede = getSedeScope(user);
  const effectiveSede = scopedSede ?? sedeFilter;

  const where: any = {
    isPoolEntry: true,
    status: "PENDING",
  };
  if (effectiveSede) where.sede = effectiveSede;

  return prisma.payment.findMany({
    where,
    orderBy: { paidAt: "desc" },
  });
}

/**
 * Admin's "fondos sin depositar" — member payments still waiting for confirmation.
 */
export async function getPendingMemberPayments(sedeFilter?: Sede) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const scopedSede = getSedeScope(user);
  const effectiveSede = scopedSede ?? sedeFilter;

  const where: any = {
    isPoolEntry: false,
    status: "PENDING",
    memberId: { not: null },
  };
  if (effectiveSede) where.sede = effectiveSede;

  return prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
      membership: { include: { plan: { select: { name: true } } } },
    },
  });
}

// ─── Isabel: bulk pool entry ──────────────────────────────────────────────────

export type PoolEntryInput = {
  paidAt: string;          // ISO date string
  depositorName: string;
  bankReference?: string;
  bankEntity?: string;
  amountCents: number;
  method: PaymentMethod;
  sede: Sede;
  notes?: string;
};

export async function createPoolEntries(entries: PoolEntryInput[]) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("Solo contabilidad o dueño puede ingresar pagos del banco.");

  const scopedSede = getSedeScope(user);

  const data = entries.map((e) => ({
    amountCents: e.amountCents,
    currency: "USD",
    method: e.method,
    status: "PENDING" as PaymentStatus,
    paidAt: new Date(e.paidAt),
    depositorName: e.depositorName || undefined,
    bankReference: e.bankReference || undefined,
    bankEntity: e.bankEntity || undefined,
    isPoolEntry: true,
    sede: scopedSede ?? e.sede,
    recordedByUserId: user.id,
    notes: e.notes || undefined,
  }));

  await prisma.payment.createMany({ data });
  revalidatePath("/dashboard/pagos");
}

// ─── Admin: register a member payment ────────────────────────────────────────

export type MemberPaymentInput = {
  memberId: string;
  membershipId?: string;
  amountCents: number;
  method: PaymentMethod;
  /** "CASH" → SUCCEEDED now; "BANK_TRANSFER" | "OTHER" → PENDING (fondos sin depositar) */
  paidAt?: string;
  depositorName?: string;
  bankReference?: string;
  bankEntity?: string;
  sede: Sede;
  notes?: string;
};

export async function registerMemberPayment(input: MemberPaymentInput) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const isCash = input.method === "CASH";
  const status: PaymentStatus = isCash ? "SUCCEEDED" : "PENDING";

  const payment = await prisma.payment.create({
    data: {
      memberId: input.memberId,
      membershipId: input.membershipId || undefined,
      amountCents: input.amountCents,
      currency: "USD",
      method: input.method,
      status,
      paidAt: isCash ? (input.paidAt ? new Date(input.paidAt) : new Date()) : (input.paidAt ? new Date(input.paidAt) : undefined),
      depositorName: input.depositorName || undefined,
      bankReference: input.bankReference || undefined,
      bankEntity: input.bankEntity || undefined,
      isPoolEntry: false,
      sede: input.sede,
      recordedByUserId: user.id,
      notes: input.notes || undefined,
    },
  });

  revalidatePath("/dashboard/pagos");
  if (input.memberId) revalidatePath(`/dashboard/socios/${input.memberId}`);
  return payment;
}

// ─── Admin: confirm a pending member payment ──────────────────────────────────

/**
 * Marks a "fondos sin depositar" payment as confirmed (SUCCEEDED).
 * Optionally merges bank details from a pool entry.
 */
export async function confirmPendingPayment(
  paymentId: string,
  opts?: {
    poolEntryId?: string;   // if provided, copy bank details from pool entry and mark it consumed
    depositorName?: string;
    bankReference?: string;
    bankEntity?: string;
    paidAt?: string;
  }
) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  let bankDetails: {
    depositorName?: string;
    bankReference?: string;
    bankEntity?: string;
    paidAt?: Date;
  } = {};

  if (opts?.poolEntryId) {
    // pull bank details from pool entry + mark it consumed
    const poolEntry = await prisma.payment.findUniqueOrThrow({
      where: { id: opts.poolEntryId },
    });
    if (!poolEntry.isPoolEntry) throw new Error("El registro seleccionado no es una entrada del banco.");
    bankDetails = {
      depositorName: poolEntry.depositorName ?? undefined,
      bankReference: poolEntry.bankReference ?? undefined,
      bankEntity: poolEntry.bankEntity ?? undefined,
      paidAt: poolEntry.paidAt ?? undefined,
    };
    // Mark pool entry as consumed (SUCCEEDED so it disappears from Sin Asignar)
    await prisma.payment.update({
      where: { id: opts.poolEntryId },
      data: { status: "SUCCEEDED" },
    });
  } else {
    // manual confirmation — use provided details
    bankDetails = {
      depositorName: opts?.depositorName || undefined,
      bankReference: opts?.bankReference || undefined,
      bankEntity: opts?.bankEntity || undefined,
      paidAt: opts?.paidAt ? new Date(opts.paidAt) : new Date(),
    };
  }

  // Verify the target payment is indeed a pending member payment
  const target = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (target.isPoolEntry || target.status !== "PENDING") {
    throw new Error("Este pago no está pendiente.");
  }

  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "SUCCEEDED",
      paidAt: bankDetails.paidAt ?? new Date(),
      depositorName: bankDetails.depositorName,
      bankReference: bankDetails.bankReference,
      bankEntity: bankDetails.bankEntity,
    },
  });

  revalidatePath("/dashboard/pagos");
  if (payment.memberId) revalidatePath(`/dashboard/socios/${payment.memberId}`);
  return payment;
}

// ─── Delete pool entry ────────────────────────────────────────────────────────

export async function deletePoolEntry(id: string) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");

  const entry = await prisma.payment.findUniqueOrThrow({ where: { id } });
  if (!entry.isPoolEntry) throw new Error("No es un registro bancario.");
  await prisma.payment.delete({ where: { id } });
  revalidatePath("/dashboard/pagos");
}

// ─── Delete member payment (only PENDING ones) ────────────────────────────────

export async function deletePendingPayment(id: string) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
  if (p.isPoolEntry || p.status !== "PENDING") throw new Error("No se puede eliminar este pago.");

  const scopedSede = getSedeScope(user);
  if (scopedSede && p.sede !== scopedSede) throw new Error("No autorizado");

  await prisma.payment.delete({ where: { id } });
  revalidatePath("/dashboard/pagos");
  if (p.memberId) revalidatePath(`/dashboard/socios/${p.memberId}`);
}

// ─── Match pool entries against a member (suggest bank deposits) ──────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns unassigned bank pool entries whose depositorName looks like the given
 * member's name. Used in the "registrar pago" flow to surface possible matches.
 */
export async function findMatchingPoolEntries(memberId: string) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { firstName: true, lastName: true, sede: true },
  });

  const candidates = await prisma.payment.findMany({
    where: {
      isPoolEntry: true,
      status: "PENDING",
      sede: member.sede,
      depositorName: { not: null },
    },
    orderBy: { paidAt: "desc" },
    take: 200,
  });

  const memberTokens = new Set(
    normalize(`${member.firstName} ${member.lastName}`).split(" ").filter((t) => t.length >= 3),
  );

  type Scored = {
    id: string;
    amountCents: number;
    method: string;
    paidAt: Date | null;
    depositorName: string | null;
    bankReference: string | null;
    bankEntity: string | null;
    score: number;
    matchedTokens: string[];
  };

  const scored: Scored[] = [];
  for (const c of candidates) {
    if (!c.depositorName) continue;
    const tokens = normalize(c.depositorName).split(" ").filter((t) => t.length >= 3);
    const matched = tokens.filter((t) => memberTokens.has(t));
    if (matched.length === 0) continue;
    scored.push({
      id: c.id,
      amountCents: c.amountCents,
      method: c.method,
      paidAt: c.paidAt,
      depositorName: c.depositorName,
      bankReference: c.bankReference,
      bankEntity: c.bankEntity,
      score: matched.length,
      matchedTokens: matched,
    });
  }

  scored.sort((a, b) => b.score - a.score || (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  return scored.slice(0, 5);
}

/**
 * Converts a pool entry into a confirmed payment for the given member+membership.
 * Same row, just retagged — keeps the bank reference and paidAt intact.
 */
export async function assignPoolEntryToMembership(
  poolEntryId: string,
  memberId: string,
  membershipId: string,
) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const pool = await prisma.payment.findUniqueOrThrow({ where: { id: poolEntryId } });
  if (!pool.isPoolEntry) throw new Error("Ese pago ya fue asignado.");

  const scopedSede = getSedeScope(user);
  if (scopedSede && pool.sede !== scopedSede) throw new Error("No autorizado");

  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    select: { sede: true },
  });
  if (pool.sede !== member.sede) throw new Error("El pago bancario es de otra sede.");

  const updated = await prisma.payment.update({
    where: { id: poolEntryId },
    data: {
      isPoolEntry: false,
      memberId,
      membershipId,
      status: "SUCCEEDED",
    },
  });

  revalidatePath("/dashboard/pagos");
  revalidatePath(`/dashboard/socios/${memberId}`);
  return updated;
}

// ─── Link an EXISTING member payment to a membership ─────────────────────────
// For payments registered from the general Payments section (memberId set but no
// membershipId): lets the admin attach them to the membership from the socio's
// ficha, so they count toward it — without re-registering (no duplicate).
export async function assignPaymentToMembership(paymentId: string, membershipId: string) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.isPoolEntry || !payment.memberId) {
    throw new Error("Este pago no está asignado a un socio.");
  }

  const scopedSede = getSedeScope(user);
  if (scopedSede && payment.sede !== scopedSede) throw new Error("No autorizado");

  // Ensure the membership belongs to the same member (no cross-member linking).
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { id: membershipId },
    select: { memberId: true },
  });
  if (membership.memberId !== payment.memberId) {
    throw new Error("La membresía no pertenece a este socio.");
  }

  // Preserve status (a pending transfer stays pending until Isabel verifies it).
  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { membershipId },
  });

  revalidatePath("/dashboard/pagos");
  revalidatePath(`/dashboard/socios/${payment.memberId}`);
  return updated;
}

// ─── Update / delete any payment (admin can fix mistakes) ─────────────────────

export async function updatePayment(
  id: string,
  data: {
    amountCents?: number;
    method?: PaymentMethod;
    status?: PaymentStatus;
    paidAt?: string | null;
    depositorName?: string | null;
    bankReference?: string | null;
    bankEntity?: string | null;
    notes?: string | null;
  },
) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const existing = await prisma.payment.findUniqueOrThrow({ where: { id } });
  const scopedSede = getSedeScope(user);
  if (scopedSede && existing.sede !== scopedSede) throw new Error("No autorizado");

  const updated = await prisma.payment.update({
    where: { id },
    data: {
      ...(data.amountCents !== undefined ? { amountCents: data.amountCents } : {}),
      ...(data.method !== undefined ? { method: data.method } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.paidAt !== undefined
        ? { paidAt: data.paidAt ? new Date(data.paidAt) : null }
        : {}),
      ...(data.depositorName !== undefined ? { depositorName: data.depositorName } : {}),
      ...(data.bankReference !== undefined ? { bankReference: data.bankReference } : {}),
      ...(data.bankEntity !== undefined ? { bankEntity: data.bankEntity } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });

  revalidatePath("/dashboard/pagos");
  if (updated.memberId) revalidatePath(`/dashboard/socios/${updated.memberId}`);
  return updated;
}

export async function deletePayment(id: string) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const existing = await prisma.payment.findUniqueOrThrow({ where: { id } });
  const scopedSede = getSedeScope(user);
  if (scopedSede && existing.sede !== scopedSede) throw new Error("No autorizado");

  await prisma.payment.delete({ where: { id } });

  revalidatePath("/dashboard/pagos");
  if (existing.memberId) revalidatePath(`/dashboard/socios/${existing.memberId}`);
}

// ─── Summary totals ───────────────────────────────────────────────────────────

export async function getPaymentSummary(sedeFilter?: Sede) {
  const user = await requireAuth();
  if (!canManagePayments(user)) throw new Error("No autorizado");

  const scopedSede = getSedeScope(user);
  const effectiveSede = scopedSede ?? sedeFilter;
  const sedeWhere = effectiveSede ? { sede: effectiveSede } : {};

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthTotal, pendingCount, poolCount] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        ...sedeWhere,
        isPoolEntry: false,
        status: "SUCCEEDED",
        paidAt: { gte: startOfMonth },
      },
      _sum: { amountCents: true },
    }),
    prisma.payment.count({
      where: { ...sedeWhere, isPoolEntry: false, status: "PENDING" },
    }),
    prisma.payment.count({
      where: { ...sedeWhere, isPoolEntry: true, status: "PENDING" },
    }),
  ]);

  return {
    monthTotalCents: monthTotal._sum.amountCents ?? 0,
    pendingCount,
    poolCount,
  };
}
