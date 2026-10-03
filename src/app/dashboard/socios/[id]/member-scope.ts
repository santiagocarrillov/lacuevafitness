import { getSedeScope } from "@/lib/auth";
import { safeBack } from "@/lib/safe-back";
import type { Prisma, User } from "@/generated/prisma/client";

/**
 * Where clause for a socio this user may open from a data-entry screen.
 * Sede-scoped staff (admins) only reach socios who train at their sede
 * (primary or secondary); everyone else sees both sedes.
 */
export function scopedMemberWhere(user: User, id: string): Prisma.MemberWhereInput {
  const scope = getSedeScope(user);
  return scope ? { id, OR: [{ sede: scope }, { secondarySede: scope }] } : { id };
}

/** Return target for the member's sub-screens: ?volver= (in-app only) or the ficha. */
export function memberBack(id: string, volver?: string) {
  return safeBack(volver, `/dashboard/socios/${id}`);
}

/** Plans offered to a socio: their sede's plans + sede-agnostic ones (trial, daily pass…). */
export function plansForSede<P extends { sede: string | null }>(plans: P[], sede: string) {
  return plans.filter((p) => p.sede == null || p.sede === sede);
}

/**
 * The membership a "Renovar" chains from — same rule as the ficha: the current
 * valid one (ACTIVE, not expired, not a one-time daily pass), else the latest
 * non-daily one. `memberships` must be ordered by startsAt desc.
 */
export function pickRenewSource<M extends { state: string; endsAt: Date; plan: { billingCycle: string } }>(
  memberships: M[],
  now = new Date(),
): M | null {
  const active = memberships.find(
    (m) => m.state === "ACTIVE" && new Date(m.endsAt) >= now && m.plan.billingCycle !== "ONE_TIME",
  );
  return active ?? memberships.find((m) => m.plan.billingCycle !== "ONE_TIME") ?? null;
}

/** Body composition + clinical labs: owner and nutritionist only (matches lib/actions/health). */
export function canEditHealth(user: User) {
  return user.role === "OWNER" || user.role === "NUTRITIONIST";
}
