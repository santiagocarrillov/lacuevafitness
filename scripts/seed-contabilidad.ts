/**
 * Plan de cuentas de ambas entidades + asiento de apertura (desde los saldos
 * iniciales firmados). Idempotente. Sin --write corre todo dentro de una
 * transacción que se revierte y solo muestra el resultado.
 *
 * Uso:  npx tsx scripts/seed-contabilidad.ts [--write]
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { seedChart } from "../src/lib/accounting/chart";
import { syncOpeningEntry } from "../src/lib/accounting/journal";
import { statements } from "../src/lib/accounting/reports";

class DryRun extends Error {}

async function main() {
  const write = process.argv.includes("--write");
  try {
    await prisma.$transaction(async (tx) => {
      for (const sede of ["XTREME", "FITNESS_CENTER"] as const) {
        const c = await seedChart(tx, sede);
        const o = await syncOpeningEntry(tx, sede);
        const s = await statements(tx, sede, new Date("2025-12-31T00:00:00Z"));
        console.log(
          `${sede}: cuentas +${c.created} / ${c.updated} actualizadas · apertura ${o.status} · ` +
          `activo ${s.totals.assets / 100} · pasivo ${s.totals.liabilities / 100} · patrimonio ${s.totals.equity / 100} · cuadre ${s.totals.check / 100}`,
        );
        if (s.totals.check !== 0) throw new Error(`${sede}: el balance no cuadra.`);
      }
      if (!write) throw new DryRun();
    }, { timeout: 120_000 });
    console.log("✅ Guardado.");
  } catch (e) {
    if (e instanceof DryRun) console.log("(simulación revertida: usa --write para guardar)");
    else throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main();
