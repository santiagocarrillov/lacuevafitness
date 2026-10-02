/**
 * Depreciación de activos fijos.
 *  A. Cálculo: cuota mensual, redondeo al final, tope en el costo, baja.
 *  B. Contabilidad (BD real, transacción revertida): los activos de Xtreme
 *     al 31-dic-2025 deprecian ~206/mes desde enero 2026; una compra nueva
 *     empieza el mes siguiente; la baja reconoce la pérdida; el libro cuadra.
 *
 * Uso:  npx tsx scripts/test-depreciacion.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { accumulatedThrough, chargeForMonth, monthIdx } from "../src/lib/accounting/depreciation";
import { postingWindow, syncJournal } from "../src/lib/accounting/posting";
import { statements } from "../src/lib/accounting/reports";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
class Rollback extends Error {}

async function main() {
  console.log("\n── A. Cálculo");
  const a = { costCents: 100000, residualCents: 0, usefulLifeMonths: 3, openingAccumulatedCents: 0, startsOn: D("2026-01-01"), disposedOn: null };
  const charges = [0, 1, 2, 3].map((k) => chargeForMonth(a, monthIdx(D("2026-01-01")) + k));
  check("$1.000 en 3 meses: 333,33 · 333,33 · 333,34 · 0", charges.join(",") === "33333,33333,33334,0", charges.join(","));
  check("acumulado nunca pasa el costo", accumulatedThrough(a, monthIdx(D("2027-12-01"))) === 100000);
  check("antes de empezar no deprecia", chargeForMonth(a, monthIdx(D("2025-12-01"))) === 0);
  const opened = { costCents: 2120877, residualCents: 0, usefulLifeMonths: 120, openingAccumulatedCents: 553922, startsOn: D("2026-01-01"), disposedOn: null };
  check("instalaciones de Xtreme: 21.208,77 / 120 = 176,73 al mes (centavos al final)", chargeForMonth(opened, monthIdx(D("2026-01-01"))) === 17673, String(chargeForMonth(opened, monthIdx(D("2026-01-01")))));
  const disposed = { ...a, usefulLifeMonths: 10, disposedOn: D("2026-03-15") };
  check("dado de baja en marzo: deprecia ene y feb, no marzo", chargeForMonth(disposed, monthIdx(D("2026-02-01"))) === 10000 && chargeForMonth(disposed, monthIdx(D("2026-03-01"))) === 0);

  console.log("\n── B. Contabilidad (transacción revertida)");
  try {
    await prisma.$transaction(async (tx) => {
      const sede = "XTREME" as const;
      const { from, to } = await postingWindow(tx, sede);
      const existing = await tx.fixedAsset.count({ where: { sede } });
      if (!existing) {
        // Same as scripts/seed-activos-xtreme.ts, inside the rolled-back transaction.
        const ob = await tx.openingBalance.findMany({ where: { account: { sede, code: { in: ["1.2.01", "1.2.02", "1.2.03", "1.2.09"] } } }, include: { account: true } });
        const acc = -(ob.find((o) => o.account.code === "1.2.09")?.amountCents ?? 0);
        const costs = ob.filter((o) => o.account.code !== "1.2.09");
        const total = costs.reduce((s, o) => s + o.amountCents, 0);
        let given = 0;
        for (const [i, o] of costs.entries()) {
          const share = i === costs.length - 1 ? acc - given : Math.round((acc * o.amountCents) / total);
          given += share;
          await tx.fixedAsset.create({ data: { sede, name: o.account.name, accountId: o.accountId, costCents: o.amountCents, acquiredOn: D("2025-12-31"), openingAccumulatedCents: share, startsOn: D("2026-01-01") } });
        }
      }
      const r = await syncJournal(tx, sede, from, to);
      check("sin errores", r.errors.length === 0, r.errors.join(" | "));
      const jan = await tx.journalEntry.findFirst({ where: { sede, source: "DEPRECIATION", sourceId: "dep:2026-01", status: "POSTED" }, include: { lines: { include: { account: true } } } });
      const janTotal = jan?.lines.filter((l) => l.account.code === "1.2.09").reduce((s, l) => s + l.creditCents, 0) ?? 0;
      check("enero 2026: Dr Depreciación · Cr Depreciación acumulada ≈ 206,09", Math.abs(janTotal - 20609) <= 3, `${janTotal / 100}`);
      check("asiento al último día del mes", jan?.date.toISOString().startsWith("2026-01-31") ?? false);
      const months = await tx.journalEntry.count({ where: { sede, source: "DEPRECIATION", status: "POSTED", sourceId: { startsWith: "dep:" } } });
      const expected = monthIdx(to) - monthIdx(D("2026-01-01")) + (to.getUTCDate() === new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0)).getUTCDate() ? 1 : 0);
      check("un asiento por cada mes terminado de 2026", months === expected, `${months} vs ${expected}`);

      // New purchase in this month → starts next month (not posted yet); dispose an opening asset.
      const eq = await tx.ledgerAccount.findFirstOrThrow({ where: { sede, code: "1.2.03" } });
      await tx.fixedAsset.create({ data: { sede, name: "Rack (prueba)", accountId: eq.id, costCents: 120000, acquiredOn: to, startsOn: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 1)) } });
      const office = await tx.fixedAsset.findFirstOrThrow({ where: { sede, account: { code: "1.2.02" } } });
      await tx.fixedAsset.update({ where: { id: office.id }, data: { disposedOn: to, disposalNote: "prueba" } });
      const r2 = await syncJournal(tx, sede, from, to);
      check("sin errores tras compra y baja", r2.errors.length === 0, r2.errors.join(" | "));
      const baja = await tx.journalEntry.findFirst({ where: { source: "DEPRECIATION", sourceId: `${office.id}:baja`, status: "POSTED" }, include: { lines: { include: { account: true } } } });
      const cost = baja?.lines.find((l) => l.account.code === "1.2.02")?.creditCents ?? 0;
      const loss = baja?.lines.find((l) => l.account.code === "5.3.99")?.debitCents ?? 0;
      const accDr = baja?.lines.find((l) => l.account.code === "1.2.09")?.debitCents ?? 0;
      check("baja: Cr activo al costo = Dr acumulada + Dr pérdida", cost === office.costCents && accDr + loss === cost && loss > 0, `${cost / 100} = ${accDr / 100} + ${loss / 100}`);
      const st = await statements(tx, sede, to);
      check("el estado de situación cuadra", st.totals.check === 0, String(st.totals.check));
      throw new Rollback();
    }, { timeout: 180_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

main()
  .catch((e) => check("ejecución", false, String(e).slice(0, 400)))
  .finally(async () => {
    await prisma.$disconnect();
    console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
    process.exit(fallos ? 1 : 0);
  });
