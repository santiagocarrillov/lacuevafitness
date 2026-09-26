"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { isStaffFreeTraining } from "@/lib/staff-free-training";
import type { Sede } from "@/generated/prisma/client";

export type AdoptionState = "app" | "invited" | "expired" | "noEmail" | "notInvited";

export type AdoptionRow = {
  memberId: string;
  name: string;
  sede: Sede;
  email: string | null;
  phone: string | null;
  state: AdoptionState;
  code: string | null;
  codeExpiresAt: string | null; // ISO
};

/**
 * Who among active/trial socios uses the app, and what's blocking the rest
 * (no email, never invited, code expired). Staff are left out.
 */
export async function getPortalAdoption(sede?: Sede | null): Promise<AdoptionRow[]> {
  const user = await requireAuth();
  if (!can.managePortalAccess(user)) throw new Error("Sin permisos");
  const scope = getSedeScope(user) ?? sede ?? null;
  const now = new Date();

  const members = await prisma.member.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      ...(scope ? { OR: [{ sede: scope }, { secondarySede: scope }] } : {}),
      // Linked staff logins are colleagues, not socios to onboard.
      NOT: { user: { role: { not: "MEMBER" } } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      sede: true,
      email: true,
      phone: true,
      userId: true,
      portalInviteCode: true,
      portalInviteCodeExpiresAt: true,
    },
  });

  return members
    .filter((m) => !isStaffFreeTraining(m.firstName, m.lastName))
    .map((m) => {
      const live = m.portalInviteCode && m.portalInviteCodeExpiresAt && m.portalInviteCodeExpiresAt > now;
      const state: AdoptionState = m.userId
        ? "app"
        : !m.email
          ? "noEmail"
          : live
            ? "invited"
            : m.portalInviteCode
              ? "expired"
              : "notInvited";
      return {
        memberId: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        sede: m.sede,
        email: m.email,
        phone: m.phone,
        state,
        code: live ? m.portalInviteCode : null,
        codeExpiresAt: live ? m.portalInviteCodeExpiresAt!.toISOString() : null,
      };
    });
}
