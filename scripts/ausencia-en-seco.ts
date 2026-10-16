/**
 * Corrida en seco de la retención de socios: a quién le saldría HOY el aviso
 * AUSENCIA con la regla nueva (2 sesiones de su ritmo), comparado con la vieja
 * (tercer día sin venir), y qué tareas de 7 y 14 días se crearían.
 *
 * Solo lee la BD. No envía WhatsApp, no crea tareas, no manda push. NUNCA llamar
 * a /api/cron/* para esto (mandan mensajes reales).
 *
 * Uso:  npx tsx --env-file=.env scripts/ausencia-en-seco.ts [--fecha=2026-10-16]
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { planNotices, trainingDaysBetween } from "../src/lib/whatsapp/member-notices";
import { absenceDecision } from "../src/lib/whatsapp/absence-rhythm";
import { generateAutoTasks } from "../src/lib/tasks/auto";
import { isStaffFreeTraining } from "../src/lib/staff-free-training";
import { ecuadorDateString } from "../src/lib/timezone";

const DAY = 86_400_000;
const arg = process.argv.find((a) => a.startsWith("--fecha="))?.slice(8);
// 15:00 UTC = 10:00 Ecuador, la hora del cron de avisos.
const now = arg ? new Date(`${arg}T15:00:00Z`) : new Date();
const today = ecuadorDateString(now);
const SEDE = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" } as const;

async function main() {
  const before = await Promise.all([prisma.memberNotice.count(), prisma.staffTask.count()]);
  console.log(`Corrida en seco — ${today} (10:00 Ecuador). Nada se envía ni se crea.\n`);

  // ── Aviso AUSENCIA, regla nueva ──
  const plans = (await planNotices(now)).filter((p) => p.kind === "AUSENCIA");
  console.log(`AVISO «Días sin venir» con la regla nueva: ${plans.length}`);
  for (const p of plans) console.log(`  · ${p.name} (${SEDE[p.sede]}) — ${p.why}\n      «${p.preview}»`);

  // ── Comparación con la regla vieja, sobre los mismos socios que pagan ──
  const payers = await prisma.member.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ userId: null }, { user: { role: "MEMBER" } }],
      memberships: { some: { state: "ACTIVE", endsAt: { gte: now }, plan: { billingCycle: { notIn: ["TRIAL", "ONE_TIME"] } } } },
    },
    select: {
      id: true, firstName: true, lastName: true, sede: true, joinedAt: true,
      attendance: { where: { recordedAt: { gte: new Date(now.getTime() - 45 * DAY), lt: now } }, orderBy: { recordedAt: "desc" }, select: { recordedAt: true } },
    },
  });
  const viejos: string[] = [];
  const ritmos = new Map<string, number>();
  for (const m of payers) {
    if (isStaffFreeTraining(m.firstName, m.lastName)) continue;
    const v = m.attendance.map((a) => a.recordedAt);
    const d = absenceDecision(v.map((x) => ecuadorDateString(x)), ecuadorDateString(m.joinedAt), today);
    const k = d.rhythm?.kind ?? "SIN DATOS";
    ritmos.set(k, (ritmos.get(k) ?? 0) + 1);
    if (!v.length || m.joinedAt.getTime() > now.getTime() - 21 * DAY) continue;
    const lastDay = ecuadorDateString(v[0]);
    const regular = v.filter((x) => x.getTime() >= v[0].getTime() - 30 * DAY).length >= 6;
    if (trainingDaysBetween(lastDay, today) === 3 && regular) viejos.push(`${m.firstName} ${m.lastName} — ${d.due ? "también con la nueva" : `NO con la nueva: ${d.why}`}`);
  }
  console.log(`\nCon la regla vieja (tercer día sin venir) hoy saldrían: ${viejos.length}`);
  for (const v of viejos) console.log(`  · ${v}`);
  console.log(`\nRitmo de los ${payers.length} socios que pagan: ${[...ritmos].map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  console.log("  (PATTERN = días fijos · RATE = sin días fijos · DEFAULT = nuevo · LOW = menos de 1,5/sem, sin aviso)");

  // ── Escalera de tareas: 7 días → escribirle, 14 → llamar ──
  const { plans: tareas } = await generateAutoTasks({ dryRun: true });
  const inas = tareas.filter((t) => t.reason === "inasistencia");
  console.log(`\nTAREAS de inasistencia que se crearían hoy (pool de la sede): ${inas.length}`);
  for (const t of inas) console.log(`  · [${SEDE[t.sede]}] ${t.type === "CALL" ? "📞" : "💬"} ${t.title}`);

  const after = await Promise.all([prisma.memberNotice.count(), prisma.staffTask.count()]);
  const intacto = after[0] === before[0] && after[1] === before[1];
  console.log(`\n${intacto ? "✅" : "❌"} no se registró ningún aviso ni tarea`);
  if (!intacto) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
