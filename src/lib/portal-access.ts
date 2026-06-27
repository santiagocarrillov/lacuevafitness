import { prisma } from "@/lib/prisma";

/**
 * Days after a membership lapses that the socio keeps full portal access.
 * Editable here without a migration (cf. ATTENDANCE_CUTOFF_MIN in timezone.ts).
 */
export const PORTAL_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PortalAccessState = "active" | "grace" | "blocked";

export type PortalAccess = {
  state: PortalAccessState;
  /** Days until the membership ends. Negative once past `endsAt`. null if no membership. */
  daysLeft: number | null;
  /** Days of grace remaining once expired. null unless `state === "grace"`. */
  graceDaysLeft: number | null;
  endsAt: Date | null;
};

/**
 * Decide whether a socio may use the portal, based on their latest real
 * membership (daily passes excluded) plus a grace window.
 *
 * - `active`  → membership current; full access.
 * - `grace`   → membership lapsed within PORTAL_GRACE_DAYS; full access + renewal banner.
 * - `blocked` → past grace, cancelled, churned, frozen, or never paid; renewal wall.
 *
 * Access is driven by the membership `endsAt` date (+ grace), not by the `state`
 * label alone, so a member whose ACTIVE row simply aged past its end date still
 * flows through grace → blocked. `state` is only used to exclude memberships that
 * were never valid access (CANCELED / PENDING_PAYMENT / PAUSED).
 */
export async function getPortalAccess(
  memberId: string,
  now: Date = new Date(),
): Promise<PortalAccess> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      status: true,
      memberships: {
        where: { plan: { billingCycle: { not: "ONE_TIME" } } },
        orderBy: { endsAt: "desc" },
        take: 1,
        select: { state: true, endsAt: true },
      },
    },
  });

  const blocked: PortalAccess = { state: "blocked", daysLeft: null, graceDaysLeft: null, endsAt: null };

  if (!member) return blocked;
  // Admin-level member states that revoke portal access outright.
  if (member.status === "CHURNED" || member.status === "PAUSED") return blocked;

  const latest = member.memberships[0];
  if (!latest) return blocked;
  // Only memberships that were genuinely paid/active can grant (or recently granted) access.
  if (latest.state !== "ACTIVE" && latest.state !== "EXPIRED") return blocked;

  const endsAt = new Date(latest.endsAt);
  const daysLeft = Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS);

  if (now <= endsAt) {
    return { state: "active", daysLeft, graceDaysLeft: null, endsAt };
  }

  const graceEnd = new Date(endsAt.getTime() + PORTAL_GRACE_DAYS * DAY_MS);
  if (now <= graceEnd) {
    const graceDaysLeft = Math.ceil((graceEnd.getTime() - now.getTime()) / DAY_MS);
    return { state: "grace", daysLeft, graceDaysLeft, endsAt };
  }

  return { state: "blocked", daysLeft, graceDaysLeft: null, endsAt };
}
