// SRXFIT evaluations seen as ONE athlete: how the whole group moves on each
// test and in body composition, how many are being measured, and who has gone
// two cycles without data (server, no auth — callers check permissions).
// Only official data counts (staff-entered or verified, OFFICIAL_ENTRY_WHERE).

import { prisma } from "@/lib/prisma";
import type { Sede, TestKey } from "@/generated/prisma/client";
import { OFFICIAL_ENTRY_WHERE } from "@/lib/entry-source";
import { isStaffFreeTraining } from "@/lib/staff-free-training";
import { SRXFIT_START } from "@/lib/srxfit-calendar";
import { TEST_LABELS } from "@/lib/portal/test-labels";

const DAY = 86_400_000;
export const CYCLE_DAYS = 63; // 9 weeks
/** Two cycles (18 weeks) with no official data → the sede admin must evaluate. */
export const EVAL_GAP_DAYS = 2 * CYCLE_DAYS;
/** Changes smaller than this (in %) count as "igual" — scale and timing noise. */
const SAME_BAND_PCT = 1;
/** Baseline and latest must be at least this far apart to compare. */
const MIN_SPAN_DAYS = 21;
/** "Asiste": visits in the last 30 days. */
export const ATTENDING_MIN_VISITS = 4;

export const blockOf = (d: Date) => (d < SRXFIT_START ? 0 : Math.floor((d.getTime() - SRXFIT_START.getTime()) / (CYCLE_DAYS * DAY)) + 1);
export const blockLabel = (b: number) => (b === 0 ? "Antes de SRXFIT" : `Bloque ${b}`);

// ── Pure pieces (tested in scripts/test-evaluaciones-grupo.ts) ─────────────

export type Point = { at: Date; value: number };

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export type TestTrend = {
  test: TestKey;
  label: string;
  unit: string;
  betterDir: "up" | "down";
  n: number; // members with a comparable baseline and latest
  improved: number;
  same: number;
  worse: number;
  /** Typical change, improvement-signed (+ is better). Median: one mistyped
   * value (minutes for seconds) must not move the whole group. */
  avgChangePct: number;
  avgBaseline: number;
  avgLatest: number;
};

/** First vs last official value per member, improvement-signed. */
export function trendFor(test: TestKey, perMember: Point[][]): TestTrend {
  const spec = TEST_LABELS[test];
  let n = 0, improved = 0, same = 0, worse = 0, sumBase = 0, sumLast = 0;
  const changes: number[] = [];
  for (const pts of perMember) {
    if (pts.length < 2) continue;
    const sorted = [...pts].sort((a, b) => a.at.getTime() - b.at.getTime());
    const base = sorted[0];
    const last = sorted[sorted.length - 1];
    if (last.at.getTime() - base.at.getTime() < MIN_SPAN_DAYS * DAY || base.value <= 0) continue;
    const raw = ((last.value - base.value) / base.value) * 100;
    const pct = spec.betterDir === "up" ? raw : -raw;
    n++;
    changes.push(pct);
    sumBase += base.value;
    sumLast += last.value;
    if (pct > SAME_BAND_PCT) improved++;
    else if (pct < -SAME_BAND_PCT) worse++;
    else same++;
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    test, label: spec.label, unit: spec.unit, betterDir: spec.betterDir, n, improved, same, worse,
    avgChangePct: n ? r1(median(changes)) : 0,
    avgBaseline: n ? r1(sumBase / n) : 0,
    avgLatest: n ? r1(sumLast / n) : 0,
  };
}

export type BodyTrend = {
  n: number;
  weightChangeKg: number; // average, latest − first
  fatChangePts: number; // average body-fat percentage points
  lostFat: number; // members whose fat mass went down
  fatKgLost: number; // total, members who lost
};

export function bodyTrend(perMember: { at: Date; weightKg: number | null; bodyFatPct: number | null }[][]): BodyTrend {
  let n = 0, dw = 0, df = 0, lost = 0, kg = 0;
  for (const rows of perMember) {
    const pts = rows.filter((r) => r.weightKg && r.bodyFatPct).sort((a, b) => a.at.getTime() - b.at.getTime());
    if (pts.length < 2) continue;
    const a = pts[0], b = pts[pts.length - 1];
    if (b.at.getTime() - a.at.getTime() < MIN_SPAN_DAYS * DAY) continue;
    n++;
    dw += b.weightKg! - a.weightKg!;
    df += b.bodyFatPct! - a.bodyFatPct!;
    const fatA = (a.weightKg! * a.bodyFatPct!) / 100;
    const fatB = (b.weightKg! * b.bodyFatPct!) / 100;
    if (fatB < fatA) {
      lost++;
      kg += fatA - fatB;
    }
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { n, weightChangeKg: n ? r1(dw / n) : 0, fatChangePts: n ? r1(df / n) : 0, lostFat: lost, fatKgLost: r1(kg) };
}

export type Insight = { level: "bad" | "warn" | "good"; text: string; href?: string };

/** What the coaches should look at first, in plain Spanish. */
export function insightsFor(s: { tests: TestTrend[]; body: BodyTrend; population: number; evaluatedThisCycle: number; gaps: number }): Insight[] {
  const out: Insight[] = [];
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  if (s.gaps > 0) out.push({ level: "bad", text: `${s.gaps} socios activos que pagan y asisten no tienen datos SRXFIT en dos ciclos.`, href: "#sin-datos" });
  const cov = pct(s.evaluatedThisCycle, s.population);
  if (s.population > 0 && cov < 60) out.push({ level: cov < 40 ? "bad" : "warn", text: `Solo ${cov}% del grupo tiene datos en este ciclo (${s.evaluatedThisCycle} de ${s.population}).` });
  for (const t of s.tests.filter((x) => x.n >= 5)) {
    const imp = pct(t.improved, t.n);
    if (t.improved === 0) out.push({ level: "bad", text: `Nadie ha mejorado ${t.label} (${t.n} socios comparables).` });
    else if (imp < 40) out.push({ level: "bad", text: `Solo ${imp}% mejoró ${t.label}; cambio típico ${t.avgChangePct > 0 ? "+" : ""}${t.avgChangePct}%.` });
    else if (t.avgChangePct <= 0) out.push({ level: "warn", text: `${t.label}: el socio típico no avanza (${t.avgChangePct}%).` });
  }
  if (s.body.n >= 5) {
    if (s.body.fatChangePts >= 0) out.push({ level: "bad", text: `En conjunto no han bajado % de grasa (${s.body.fatChangePts >= 0 ? "+" : ""}${s.body.fatChangePts} puntos en promedio, ${s.body.n} socios).` });
    else out.push({ level: "good", text: `El grupo bajó ${Math.abs(s.body.fatChangePts)} puntos de grasa en promedio: ${s.body.fatKgLost} kg de grasa entre ${s.body.lostFat} socios.` });
  }
  const best = [...s.tests].filter((t) => t.n >= 5).sort((a, b) => b.avgChangePct - a.avgChangePct)[0];
  if (best && best.avgChangePct > 0) out.push({ level: "good", text: `Donde más mejoran: ${best.label}, +${best.avgChangePct}% el socio típico (${pct(best.improved, best.n)}% mejoró).` });
  return out;
}

// ── Loader ──────────────────────────────────────────────────────────────────

export type EvalGap = { memberId: string; name: string; sede: Sede; lastDataAt: Date | null; visits30: number };

export type BlockRow = { block: number; label: string; n: number; bodyFatAvg: number | null; weightAvg: number | null; benchAvg: number | null; squatAvg: number | null };

export type GroupStats = {
  population: number;
  evaluatedThisCycle: number;
  tests: TestTrend[];
  body: BodyTrend;
  blocks: BlockRow[];
  gaps: EvalGap[];
  insights: Insight[];
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Members who train and pay (staff left out). */
async function population(sede: Sede | null, now: Date) {
  const members = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      ...(sede ? { sede } : {}),
      OR: [{ userId: null }, { user: { role: "MEMBER" } }],
      memberships: { some: { state: "ACTIVE", endsAt: { gte: now }, plan: { billingCycle: { notIn: ["TRIAL", "ONE_TIME"] } } } },
    },
    select: { id: true, firstName: true, lastName: true, sede: true, attendance: { where: { recordedAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { id: true } } },
  });
  return members.filter((m) => !isStaffFreeTraining(m.firstName, m.lastName));
}

export async function groupEvaluationStats(opts: { sede?: Sede | null; now?: Date } = {}): Promise<GroupStats> {
  const now = opts.now ?? new Date();
  const members = await population(opts.sede ?? null, now);
  const ids = members.map((m) => m.id);
  const [tests, bodies] = await Promise.all([
    prisma.testResult.findMany({ where: { memberId: { in: ids }, ...OFFICIAL_ENTRY_WHERE }, select: { memberId: true, test: true, valueNumeric: true, recordedAt: true } }),
    prisma.bodyComposition.findMany({ where: { memberId: { in: ids }, ...OFFICIAL_ENTRY_WHERE }, select: { memberId: true, measuredAt: true, weightKg: true, bodyFatPct: true } }),
  ]);

  // Per test → per member series.
  const byTest = new Map<TestKey, Map<string, Point[]>>();
  for (const t of tests) {
    const m = byTest.get(t.test) ?? new Map<string, Point[]>();
    m.set(t.memberId, [...(m.get(t.memberId) ?? []), { at: t.recordedAt, value: t.valueNumeric }]);
    byTest.set(t.test, m);
  }
  const trends = (Object.keys(TEST_LABELS) as TestKey[])
    .map((k) => trendFor(k, [...(byTest.get(k)?.values() ?? [])]))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n);

  const bodyBy = new Map<string, { at: Date; weightKg: number | null; bodyFatPct: number | null }[]>();
  for (const b of bodies) bodyBy.set(b.memberId, [...(bodyBy.get(b.memberId) ?? []), { at: b.measuredAt, weightKg: b.weightKg, bodyFatPct: b.bodyFatPct }]);
  const body = bodyTrend([...bodyBy.values()]);

  // Group average per SRXFIT block (each member's last value in the block).
  const lastIn = <T extends { at: Date }>(rows: T[], block: number) =>
    rows.filter((r) => blockOf(r.at) === block).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  const blocks: BlockRow[] = [];
  const maxBlock = blockOf(now);
  for (let b = 0; b <= maxBlock; b++) {
    const fat: number[] = [], weight: number[] = [], bench: number[] = [], squat: number[] = [];
    const contributors = new Set<string>();
    for (const [id, rows] of bodyBy) {
      const r = lastIn(rows, b);
      if (r?.bodyFatPct) { fat.push(r.bodyFatPct); contributors.add(id); }
      if (r?.weightKg) { weight.push(r.weightKg); contributors.add(id); }
    }
    for (const [key, arr] of [["BENCH_PRESS_3RM", bench], ["BACK_SQUAT_3RM", squat]] as const) {
      for (const [id, pts] of byTest.get(key) ?? []) {
        const r = lastIn(pts, b);
        if (r) { arr.push(r.value); contributors.add(id); }
      }
    }
    if (contributors.size) blocks.push({ block: b, label: blockLabel(b), n: contributors.size, bodyFatAvg: avg(fat), weightAvg: avg(weight), benchAvg: avg(bench), squatAvg: avg(squat) });
  }

  const lastData = new Map<string, Date>();
  const bump = (id: string, d: Date) => { const cur = lastData.get(id); if (!cur || d > cur) lastData.set(id, d); };
  for (const t of tests) bump(t.memberId, t.recordedAt);
  for (const b of bodies) bump(b.memberId, b.measuredAt);
  const cycleStart = new Date(now.getTime() - CYCLE_DAYS * DAY);
  const evaluatedThisCycle = members.filter((m) => (lastData.get(m.id) ?? new Date(0)) >= cycleStart).length;

  const gapSince = new Date(now.getTime() - EVAL_GAP_DAYS * DAY);
  const gaps: EvalGap[] = members
    .filter((m) => m.attendance.length >= ATTENDING_MIN_VISITS && (lastData.get(m.id) ?? new Date(0)) < gapSince)
    .map((m) => ({ memberId: m.id, name: `${m.firstName} ${m.lastName}`.trim(), sede: m.sede, lastDataAt: lastData.get(m.id) ?? null, visits30: m.attendance.length }))
    .sort((a, b) => (a.lastDataAt?.getTime() ?? 0) - (b.lastDataAt?.getTime() ?? 0));

  const stats = { population: members.length, evaluatedThisCycle, tests: trends, body, blocks, gaps };
  return { ...stats, insights: insightsFor({ ...stats, gaps: gaps.length }) };
}

/** Same rule, for the 5:00 automatic tasks: who needs an evaluation, per sede. */
export async function evaluationGaps(now = new Date()): Promise<EvalGap[]> {
  return (await groupEvaluationStats({ now })).gaps;
}
