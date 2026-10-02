/**
 * Registro de activos fijos de Xtreme desde los saldos iniciales firmados
 * (EEFF 2025, Nota 7): un activo por cuenta, con la depreciación acumulada
 * repartida en proporción al costo. Se deprecian desde enero 2026 al 10 %
 * anual (aprobado por Santiago el 2 oct 2026). Idempotente.
 *
 * Uso:  npx tsx scripts/seed-activos-xtreme.ts [--write]
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { chargeForMonth, monthIdx } from "../src/lib/accounting/depreciation";

const NAMES: Record<string, string> = {
  "1.2.01": "Instalaciones y adecuaciones (saldo al 31-dic-2025)",
  "1.2.02": "Muebles y equipo de oficina (saldo al 31-dic-2025)",
  "1.2.03": "Equipos y maquinaria (saldo al 31-dic-2025)",
};
class DryRun extends Error {}

async function main() {
  const write = process.argv.includes("--write");
  try {
    await prisma.$transaction(async (tx) => {
      const asOf = new Date("2025-12-31T00:00:00Z");
      const ob = await tx.openingBalance.findMany({ where: { asOf, account: { sede: "XTREME", code: { in: [...Object.keys(NAMES), "1.2.09"] } } }, include: { account: true } });
      const acc = -(ob.find((o) => o.account.code === "1.2.09")?.amountCents ?? 0);
      const costs = ob.filter((o) => o.account.code !== "1.2.09").sort((a, b) => a.account.code.localeCompare(b.account.code));
      const total = costs.reduce((s, o) => s + o.amountCents, 0);
      console.log(`Costo ${total / 100} · depreciación acumulada ${acc / 100}`);
      let given = 0;
      for (const [i, o] of costs.entries()) {
        const exists = await tx.fixedAsset.findFirst({ where: { sede: "XTREME", accountId: o.accountId, acquiredOn: asOf } });
        const share = i === costs.length - 1 ? acc - given : Math.round((acc * o.amountCents) / total);
        given += share;
        if (exists) {
          console.log(`  ya existe: ${exists.name}`);
          continue;
        }
        const a = await tx.fixedAsset.create({
          data: {
            sede: "XTREME", name: NAMES[o.account.code], accountId: o.accountId, costCents: o.amountCents,
            acquiredOn: asOf, usefulLifeMonths: 120, openingAccumulatedCents: share, startsOn: new Date("2026-01-01T00:00:00Z"),
          },
        });
        console.log(`  + ${a.name}: costo ${a.costCents / 100}, depreciado ${share / 100}, cuota ${chargeForMonth(a, monthIdx(a.startsOn)) / 100}/mes`);
      }
      if (!write) throw new DryRun();
    });
    console.log("✅ Guardado.");
  } catch (e) {
    if (e instanceof DryRun) console.log("(simulación revertida: usa --write para guardar)");
    else throw e;
  } finally {
    await prisma.$disconnect();
  }
}
main();
