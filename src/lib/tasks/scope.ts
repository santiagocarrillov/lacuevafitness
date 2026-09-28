// Who works which tasks. A plain module (not "use server") so cron jobs can
// share the rules with the server actions.
import { getSedeScope, can } from "@/lib/auth";
import type { Prisma, User, UserRole } from "@/generated/prisma/client";

// Everyone on staff can send and receive tasks (decided 28 sep 2026).
export const TASK_ROLES: UserRole[] = ["OWNER", "ACCOUNTING", "ADMIN", "COACH", "NUTRITIONIST"];

/**
 * Unassigned tasks of a sede — the front desk's pool. Only the roles that run
 * the front desk work it; an admin sees their sede plus the both-sedes pool.
 */
export function poolWhere(user: User): Prisma.StaffTaskWhereInput | null {
  if (!can.manageLeads(user)) return null;
  const scope = getSedeScope(user);
  return {
    assigneeId: null,
    ...(scope ? { OR: [{ sede: scope }, { sede: null }] } : {}),
  };
}

/** Mine plus my pool: what the badge, the Resumen and the morning push count. */
export function mineOrPoolWhere(user: User): Prisma.StaffTaskWhereInput {
  const pool = poolWhere(user);
  return pool ? { OR: [{ assigneeId: user.id }, pool] } : { assigneeId: user.id };
}
