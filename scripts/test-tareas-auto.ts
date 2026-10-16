/**
 * Prueba de las tareas automáticas (src/lib/tasks/auto.ts): el fin del trial de
 * $9 es un cierre de venta, no una renovación. El 1 oct 2026 hubo que cancelar
 * a mano "Cobrar renovación a Rocío Bonilla" y "… a Nelson Cuichan".
 *
 * Solo lee: generateAutoTasks({ dryRun: true }) no crea nada. NUNCA llamar a
 * /api/cron/* para probar (manda push reales).
 *
 * Uso:  npx tsx scripts/test-tareas-auto.ts
 */

import "dotenv/config";
import { generateAutoTasks, inactivePlan, renewalPlan, trialClosePlan } from "../src/lib/tasks/auto";
import { prisma } from "../src/lib/prisma";

let fallos = 0;
function check(nombre: string, ok: boolean) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
}

// ── Textos (sin BD) ───────────────────────────────────────────────────────
const ms = {
  id: "ms1",
  endsAt: new Date("2026-10-02T15:00:00Z"), // 10:00 EC del 2 oct
  customPriceCents: null,
  plan: { name: "Trial 2 semanas", priceCents: 900 },
  member: { id: "m1", firstName: "Rocío", lastName: "Bonilla", sede: "FITNESS_CENTER" as const },
};
const trial = trialClosePlan(ms, 5, "2026-10-01");
check(`título: "${trial.title}"`, trial.title === "Cierre de trial: Rocío Bonilla — termina mañana (5 clases)");
check("clave trialclose:<membershipId>", trial.autoKey === "trialclose:ms1");
check("tipo TASK, no COLLECTION", trial.type === "TASK");
check("detalle con la escalera $60 / $50 / $40", ["$60", "$50", "$40", "débito automático"].every((t) => trial.detail.includes(t)));
check("detalle sugiere mostrar la evaluación", trial.detail.includes("evaluación"));
check("singular con 1 clase", trialClosePlan(ms, 1, "2026-10-01").title.endsWith("(1 clase)"));
const renewal = renewalPlan({ ...ms, plan: { name: "Mensual", priceCents: 5000 } }, "2026-10-01");
check(`renovación intacta: "${renewal.title}"`, renewal.autoKey === "renewal:ms1" && renewal.type === "COLLECTION");

// ── Escalera de inasistencia (Santiago, 16 oct 2026): 7 días → escribirle, 14 → llamar ──
const socio = { id: "m9", firstName: "Diego", lastName: "Paredes", sede: "XTREME" as const };
const ultima = new Date("2026-10-01T23:00:00Z"); // 18:00 EC del 1 oct
check("6 días: nada (lo cubren el aviso y el agente)", inactivePlan(socio, ultima, 6, []) === null);
const d7 = inactivePlan(socio, ultima, 7, []);
check(`7 días: "${d7?.title}"`, d7?.type === "WHATSAPP" && d7.title === "Escribirle a Diego Paredes: 7 días sin venir");
check("7 días: clave inactive7:<socio>:<última visita>", d7?.autoKey === "inactive7:m9:2026-10-01");
check("7 días: ofrece soluciones y cierra con ¿qué día vuelves?", !!d7 && ["horario", "rutina más corta", "coach", "nutricionista", "pausa", "¿qué día vuelves?"].every((t) => d7.detail.includes(t)));
check("7 días con una tarea abierta: no duplica", inactivePlan(socio, ultima, 9, ["inactive7:m9:2026-10-01"]) === null);
const d14 = inactivePlan(socio, ultima, 14, ["inactive7:m9:2026-10-01"]);
check(`14 días: "${d14?.title}" aunque siga abierta la de 7`, d14?.type === "CALL" && d14.autoKey === "inactive:m9:2026-10-01" && d14.priority === 1);
check("14 días con la llamada vieja abierta: no duplica", inactivePlan(socio, ultima, 16, ["inactive:m9:2026-10-01"]) === null);
check("más de 30 días: nada", inactivePlan(socio, ultima, 31, []) === null);

// ── Dry run contra la BD (solo lectura) ───────────────────────────────────
async function main() {
  const { plans, ...summary } = await generateAutoTasks({ dryRun: true });
  console.log("\nDry run:", JSON.stringify(summary.byReason), `(${summary.alreadyThere} ya existían)`);
  for (const p of plans.filter((p) => p.reason !== "inasistencia")) console.log(`   · ${p.title}`);

  const keys = plans.filter((p) => p.reason !== "evaluación").map((p) => p.autoKey);
  const ids = keys.map((k) => k.split(":")[1]);
  const memberships = await prisma.membership.findMany({
    where: { id: { in: ids } },
    select: { id: true, plan: { select: { billingCycle: true } } },
  });
  const cycle = new Map(memberships.map((m) => [m.id, m.plan.billingCycle]));
  const renewals = plans.filter((p) => p.autoKey.startsWith("renewal:"));
  const closes = plans.filter((p) => p.autoKey.startsWith("trialclose:"));
  check(
    `ninguna renovación es de un TRIAL (${renewals.length} renovaciones)`,
    renewals.every((p) => cycle.get(p.autoKey.slice("renewal:".length)) !== "TRIAL"),
  );
  check(
    `todo cierre de trial es de un TRIAL (${closes.length} cierres)`,
    closes.every((p) => cycle.get(p.autoKey.slice("trialclose:".length)) === "TRIAL"),
  );
  check(
    "ONE_TIME fuera de ambas",
    [...renewals, ...closes].every((p) => cycle.get(p.autoKey.split(":")[1]) !== "ONE_TIME"),
  );
}

main()
  .then(() => {
    console.log(fallos ? `\n${fallos} fallos` : "\nTodo bien");
    process.exitCode = fallos ? 1 : 0;
  })
  .finally(() => prisma.$disconnect());
