// Pushes around a self-reported entry: the staff nudge when a socio logs
// something, and the socio's "validado / descartado" once a coach decides.
// Plain module — no permission checks; callers authorise. Best-effort: never
// let a failed push break a save.

import { prisma } from "@/lib/prisma";
import { pushToMember } from "@/lib/push/send";
import type { Sede, UserRole } from "@/generated/prisma/client";
import type { ValidationKind } from "./queue";

export const VALIDATION_QUEUE_PATH = "/dashboard/srxfit/validar";

/** Who can validate each kind (mirrors can.editTests / can.editBodyComp). */
const VALIDATOR_ROLES: Record<ValidationKind, UserRole[]> = {
  pr: ["COACH", "NUTRITIONIST", "ADMIN", "OWNER"],
  measurement: ["NUTRITIONIST", "ADMIN", "OWNER"],
};

/**
 * A burst of logs (a socio entering three PRs, or five socios after the same
 * class) is one push, not five: if another entry of the same kind and sede was
 * already logged in this window and is still pending, its push already went
 * out and the staff will find this one in the same list.
 */
const BURST_MS = 2 * 60 * 60 * 1000;

export async function notifyStaffOfSelfEntry(opts: {
  kind: ValidationKind;
  entryId: string;
  memberId: string;
  memberName: string;
  memberSede: Sede;
  summary: string;
}): Promise<{ notified: number }> {
  const since = new Date(Date.now() - BURST_MS);
  const member = { sede: opts.memberSede };
  const pending = { source: "MEMBER" as const, verifiedAt: null, member };

  const [recentOthers, total] =
    opts.kind === "pr"
      ? await Promise.all([
          prisma.testResult.count({ where: { ...pending, id: { not: opts.entryId }, recordedAt: { gte: since } } }),
          prisma.testResult.count({ where: pending }),
        ])
      : await Promise.all([
          prisma.bodyComposition.count({ where: { ...pending, id: { not: opts.entryId }, measuredAt: { gte: since } } }),
          prisma.bodyComposition.count({ where: pending }),
        ]);
  if (recentOthers > 0) return { notified: 0 };

  const staff = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: VALIDATOR_ROLES[opts.kind] },
      OR: [{ sede: null }, { sede: opts.memberSede }],
    },
    select: { member: { select: { id: true } } },
  });
  const targets = staff
    .map((s) => s.member?.id)
    .filter((id): id is string => Boolean(id) && id !== opts.memberId);
  if (targets.length === 0) return { notified: 0 };

  const others = total - 1;
  const payload = {
    title: total === 1 ? "1 registro por validar" : `${total} registros por validar`,
    body: `${opts.memberName}: ${opts.summary}${others > 0 ? ` (y ${others} más)` : ""}`,
    url: VALIDATION_QUEUE_PATH,
  };
  await Promise.all(targets.map((id) => pushToMember(id, payload).catch(() => undefined)));
  return { notified: targets.length };
}

export type ReviewedEntry = { memberId: string; kind: ValidationKind; label: string };

/**
 * Tell each socio how their entries were reviewed — one push per socio, so a
 * bulk "Validar todos los verdes" doesn't buzz anyone's phone five times.
 */
export async function notifyMembersOfReview(entries: ReviewedEntry[], verdict: "verified" | "rejected") {
  const byMember = new Map<string, ReviewedEntry[]>();
  for (const e of entries) byMember.set(e.memberId, [...(byMember.get(e.memberId) ?? []), e]);

  await Promise.all(
    [...byMember.entries()].map(([memberId, list]) => {
      const one = list.length === 1 ? list[0] : null;
      const payload =
        verdict === "verified"
          ? {
              title: one ? (one.kind === "pr" ? "Tu marca fue validada ✅" : "Tus medidas fueron validadas ✅") : `${list.length} registros validados ✅`,
              body: `${one ? `${one.label}. ` : ""}Ya cuenta${one ? "" : "n"} para tus retos y rankings.`,
            }
          : {
              title: one ? "Tu registro no fue validado" : `${list.length} registros no fueron validados`,
              body: `${one ? `${one.label}. ` : ""}Si crees que es un error, habla con tu coach.`,
            };
      return pushToMember(memberId, { ...payload, url: "/portal/progreso" }).catch(() => undefined);
    }),
  );
}
