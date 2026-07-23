import { prisma } from "@/lib/prisma";
import { pushToMember } from "./send";
import type { Sede } from "@/generated/prisma/client";

/** Roles that should hear about a socio logging their own data. */
const NOTIFIED_ROLES = ["COACH", "NUTRITIONIST", "ADMIN", "OWNER"] as const;

/**
 * Tell the coaching staff a socio just self-reported something, so it gets
 * validated instead of sitting unnoticed in the member's profile.
 *
 * Push delivery is keyed to Member records, and staff have their own ficha, so
 * we notify each staff user through their linked member. Scoped by sede: staff
 * with a sede only hear about their own location; OWNER/ACCOUNTING and other
 * sede-less staff hear about both.
 *
 * Best-effort by design — callers must not let a failed notification break the
 * socio's save.
 */
export async function notifyStaffOfSelfEntry(opts: {
  memberId: string;
  memberName: string;
  memberSede: Sede;
  summary: string;
}): Promise<{ notified: number }> {
  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: [...NOTIFIED_ROLES] },
      OR: [{ sede: null }, { sede: opts.memberSede }],
    },
    select: { id: true, member: { select: { id: true } } },
  });

  const targets = staff
    .map((s) => s.member?.id)
    .filter((id): id is string => Boolean(id) && id !== opts.memberId);

  if (targets.length === 0) return { notified: 0 };

  const payload = {
    title: "Registro de un socio por validar",
    body: `${opts.memberName}: ${opts.summary}`,
    url: `/dashboard/socios/${opts.memberId}`,
  };

  await Promise.all(
    targets.map((memberId) => pushToMember(memberId, payload).catch(() => undefined)),
  );

  return { notified: targets.length };
}
