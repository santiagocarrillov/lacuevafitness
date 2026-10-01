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
import { generateAutoTasks, renewalPlan, trialClosePlan } from "../src/lib/tasks/auto";
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
