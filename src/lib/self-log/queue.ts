// SRXFIT › Por validar: every self-reported entry still waiting for a coach,
// with the socio's last official data next to it so the call takes a second.
// Plain module (no "use server"): the page, the nav badge, the push nudges and
// the 7:30 digest all read it; callers do the permission check.

import { prisma } from "@/lib/prisma";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { SELF_LOGGABLE_TESTS } from "@/lib/portal/self-log-tests";
import { checkMeasurement, checkPr, MEASUREMENT_FIELDS, type MeasurementValues } from "./plausibility";
import type { Prisma, Sede, User } from "@/generated/prisma/client";

export type ValidationKind = "pr" | "measurement";

/** What this user may validate — same rules as verifySelfEntry. */
export function validationKinds(user: Pick<User, "role">): ValidationKind[] {
  const r = user.role;
  const kinds: ValidationKind[] = [];
  if (r === "OWNER" || r === "COACH" || r === "NUTRITIONIST" || r === "ADMIN") kinds.push("pr");
  if (r === "OWNER" || r === "NUTRITIONIST" || r === "ADMIN") kinds.push("measurement");
  return kinds;
}

export type QueueItem = {
  id: string;
  kind: ValidationKind;
  memberId: string;
  memberName: string;
  sede: Sede;
  /** ISO timestamp of when the socio logged it. */
  at: string;
  title: string;
  /** Value line(s), e.g. "100 kg" or "Peso 74.5 kg (−0.6 kg)". */
  lines: string[];
  /** Best/last official reference, e.g. "Mejor marca oficial: 92 kg". */
  reference: string | null;
  green: boolean;
  note: string;
  notes: string | null;
};

/** A sede's socios — those who train there as a second sede too, like the review guard. */
function memberWhere(sede: Sede | null): Prisma.MemberWhereInput {
  return sede ? { OR: [{ sede }, { secondarySede: sede }] } : {};
}

const PENDING = { source: "MEMBER" as const, verifiedAt: null };

export async function countPendingValidations(opts: { sede: Sede | null; kinds: ValidationKind[] }): Promise<number> {
  const member = memberWhere(opts.sede);
  const [prs, comps] = await Promise.all([
    opts.kinds.includes("pr") ? prisma.testResult.count({ where: { ...PENDING, member } }) : 0,
    opts.kinds.includes("measurement") ? prisma.bodyComposition.count({ where: { ...PENDING, member } }) : 0,
  ]);
  return prs + comps;
}

export async function getValidationQueue(opts: { sede: Sede | null; kinds: ValidationKind[] }): Promise<QueueItem[]> {
  const member = memberWhere(opts.sede);
  const memberSelect = { select: { firstName: true, lastName: true, sede: true } } as const;

  const [prs, comps] = await Promise.all([
    opts.kinds.includes("pr")
      ? prisma.testResult.findMany({
          where: { ...PENDING, member },
          include: { member: memberSelect },
          orderBy: { recordedAt: "asc" },
          take: 200,
        })
      : [],
    opts.kinds.includes("measurement")
      ? prisma.bodyComposition.findMany({
          where: { ...PENDING, member },
          include: { member: memberSelect },
          orderBy: { measuredAt: "asc" },
          take: 200,
        })
      : [],
  ]);

  const memberIds = [...new Set([...prs.map((p) => p.memberId), ...comps.map((c) => c.memberId)])];
  if (memberIds.length === 0) return [];

  // The socio's official history: best mark per test, latest value per body field.
  const [officialTests, officialComps] = await Promise.all([
    prs.length
      ? prisma.testResult.findMany({
          where: {
            memberId: { in: [...new Set(prs.map((p) => p.memberId))] },
            test: { in: [...new Set(prs.map((p) => p.test))] },
            ...OFFICIAL_ENTRY_WHERE,
          },
          select: { memberId: true, test: true, valueNumeric: true },
        })
      : [],
    prisma.bodyComposition.findMany({
      where: { memberId: { in: memberIds }, ...OFFICIAL_ENTRY_WHERE },
      orderBy: { measuredAt: "desc" },
      select: { memberId: true, weightKg: true, waistCm: true, hipCm: true, chestCm: true, armCm: true, thighCm: true },
    }),
  ]);

  const best = new Map<string, number>();
  for (const t of officialTests) {
    const k = `${t.memberId}:${t.test}`;
    if (t.valueNumeric > (best.get(k) ?? -Infinity)) best.set(k, t.valueNumeric);
  }
  const lastBody = new Map<string, MeasurementValues>();
  for (const c of officialComps) {
    const prev = lastBody.get(c.memberId) ?? {};
    for (const f of MEASUREMENT_FIELDS) {
      if (prev[f.key] == null && c[f.key] != null) prev[f.key] = c[f.key];
    }
    lastBody.set(c.memberId, prev);
  }

  const name = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`.trim();

  const prItems: QueueItem[] = prs.map((p) => {
    const meta = SELF_LOGGABLE_TESTS.find((t) => t.key === p.test);
    const previousBest = best.get(`${p.memberId}:${p.test}`) ?? null;
    const check = checkPr({
      test: p.test,
      value: p.valueNumeric,
      unit: p.unit,
      previousBest,
      bodyWeightKg: lastBody.get(p.memberId)?.weightKg ?? null,
    });
    return {
      id: p.id,
      kind: "pr",
      memberId: p.memberId,
      memberName: name(p.member),
      sede: p.member.sede,
      at: p.recordedAt.toISOString(),
      title: meta?.label ?? p.test,
      lines: [`${p.valueNumeric} ${p.unit}`],
      reference: previousBest != null ? `Mejor marca oficial: ${previousBest} ${p.unit}` : null,
      green: check.green,
      note: check.note,
      notes: p.notes,
    };
  });

  const compItems: QueueItem[] = comps.map((c) => {
    const previous = lastBody.get(c.memberId) ?? {};
    const check = checkMeasurement(c, previous);
    return {
      id: c.id,
      kind: "measurement",
      memberId: c.memberId,
      memberName: name(c.member),
      sede: c.member.sede,
      at: c.measuredAt.toISOString(),
      title: "Medidas",
      lines: check.lines,
      reference: previous.weightKg != null ? `Último peso oficial: ${previous.weightKg} kg` : null,
      green: check.green,
      note: check.note,
      notes: c.notes,
    };
  });

  // Oldest first: nothing sits at the bottom forever.
  return [...prItems, ...compItems].sort((a, b) => a.at.localeCompare(b.at));
}
