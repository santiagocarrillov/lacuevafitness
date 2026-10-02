/**
 * Contabilización automática (1b).
 *  A. Pure rules: IVA split, prepaid months (commitment plans paid monthly are
 *     NOT deferred), accounting day.
 *  B. Real 2026 data inside ONE rolled-back transaction: full sync of both
 *     entities, books balance, IVA matches collections, idempotency, a voided
 *     document un-posts, closed periods are not touched.
 *
 * Uso:  npx tsx scripts/test-contabilizacion.ts
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { postingDay, postingWindow, prepaidMonths, splitIva, syncJournal } from "../src/lib/accounting/posting";
import { statements, trialBalance } from "../src/lib/accounting/reports";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const usd = (c: number) => (c / 100).toFixed(2);
class Rollback extends Error {}

async function main() {
  // The live books may already hold automatic entries (Contabilidad syncs on open).
  const AUTO = ["PAYMENT", "INVOICE", "EXPENSE", "CAPITAL", "OTHER_INCOME", "DEFERRED_REVENUE", "DEPRECIATION"] as const;
  const autoBefore = await prisma.journalEntry.count({ where: { source: { in: [...AUTO] } } });
  console.log("\n── A. Reglas");
  const s = splitIva(5000);
  check("$50 con IVA = 43,48 + 6,52", s.net === 4348 && s.iva === 652);
  check("$9 trial = 7,83 + 1,17", splitIva(900).net === 783 && splitIva(900).iva === 117);
  check("anual pagado en cuotas ($40 de $480) → no se difiere", prepaidMonths(4000, "ANNUAL", 48000) === 1);
  check("semestral en cuotas ($45 de $270) → no se difiere", prepaidMonths(4500, "SEMIANNUAL", 27000) === 1);
  check("trimestral prepagado ($135 de $135) → 3 meses", prepaidMonths(13500, "QUARTERLY", 13500) === 3);
  check("semestral prepagado ($243 de $243) → 6 meses", prepaidMonths(24300, "SEMIANNUAL", 24300) === 6);
  check("mensual → 1", prepaidMonths(5000, "MONTHLY", 5000) === 1);
  check("día de una fecha guardada a medianoche UTC = ese día", postingDay(new Date("2026-09-30T00:00:00Z")).toISOString().startsWith("2026-09-30"));
  check("día de un timestamp real = día en Ecuador", postingDay(new Date("2026-10-01T03:00:00Z")).toISOString().startsWith("2026-09-30"));

  console.log("\n── B. Datos reales 2026 (transacción revertida)");
  try {
    await prisma.$transaction(async (tx) => {
      for (const sede of ["XTREME", "FITNESS_CENTER"] as const) {
        const { from, to } = await postingWindow(tx, sede);
        const r1 = await syncJournal(tx, sede, from, to);
        const st = await statements(tx, sede, to);
        const tb = await trialBalance(tx, sede, from, to);
        const det = tb.filter((x) => x.postable);
        const dr = det.reduce((a, x) => a + x.debitCents, 0);
        const cr = det.reduce((a, x) => a + x.creditCents, 0);
        console.log(`   ${sede}: ${r1.created} asientos (${r1.errors.length} errores) · ingresos/resultado ${usd(st.resultCents)} · activo ${usd(st.totals.assets)}`);
        check(`${sede}: sin errores de contabilización`, r1.errors.length === 0, r1.errors.slice(0, 3).join(" | "));
        check(`${sede}: debe = haber en el período`, dr === cr, `${usd(dr)} / ${usd(cr)}`);
        check(`${sede}: estado de situación cuadra`, st.totals.check === 0, usd(st.totals.check));

        // IVA por pagar of September = IVA of September collections (+ product sales).
        const sep = await trialBalance(tx, sede, D("2026-09-01"), D("2026-09-30"));
        const ivaCredits = sep.find((x) => x.code === "2.1.06")?.creditCents ?? 0;
        const pays = await tx.payment.findMany({
          where: { sede, status: { in: ["SUCCEEDED", "PENDING"] }, paidAt: { gte: D("2026-08-31"), lt: D("2026-10-02") }, NOT: { isPoolEntry: true, status: "SUCCEEDED" } },
        });
        const expectIva = pays.filter((p) => { const d = postingDay(p.paidAt!); return d >= D("2026-09-01") && d <= D("2026-09-30"); })
          .reduce((a, p) => a + splitIva(p.amountCents).iva, 0);
        const prod = await tx.otherIncome.findMany({ where: { sede, voidedAt: null, category: "PRODUCT_SALE", date: { gte: D("2026-09-01"), lte: D("2026-09-30") } } });
        const expectProd = prod.reduce((a, o) => a + splitIva(o.amountCents).iva, 0);
        check(`${sede}: IVA de septiembre = IVA de lo cobrado`, ivaCredits === expectIva + expectProd, `${usd(ivaCredits)} vs ${usd(expectIva + expectProd)}`);

        const r2 = await syncJournal(tx, sede, from, to);
        check(`${sede}: segunda pasada no cambia nada`, r2.created === 0 && r2.voided === 0 && r2.unchanged >= r1.created, `${r2.created}/${r2.voided}/${r2.unchanged}`);
      }

      // A deferred prepayment and a voided document.
      const xFrom = (await postingWindow(tx, "XTREME")).from;
      const xTo = (await postingWindow(tx, "XTREME")).to;
      const deferred = await tx.journalEntry.count({ where: { sede: "XTREME", source: "DEFERRED_REVENUE", status: "POSTED" } });
      check("hay ingresos diferidos reconocidos mes a mes", deferred > 0, `${deferred} asientos`);

      const exp = await tx.expense.create({
        data: { sede: "XTREME", category: "UTILITIES", description: "Luz (prueba)", amountCents: 11500, ivaCents: 1500, date: D("2026-09-10"), status: "PAID", paidAt: D("2026-09-12"), paymentMethod: "CASH" },
      });
      const r3 = await syncJournal(tx, "XTREME", xFrom, xTo);
      const ee = await tx.journalEntry.findMany({ where: { sourceId: { in: [exp.id, `${exp.id}:pago`] }, status: "POSTED" }, include: { lines: true } });
      check("gasto pagado → devengo + pago (2 asientos)", r3.created === 2 && ee.length === 2);
      const accr = ee.find((e) => e.sourceId === exp.id)!;
      check("devengo: gasto 100 + IVA crédito 15 contra proveedores 115", accr.lines.reduce((a, l) => a + l.debitCents, 0) === 11500 && accr.lines.length === 3);
      await tx.expense.update({ where: { id: exp.id }, data: { voidedAt: new Date(), voidReason: "prueba" } });
      const r4 = await syncJournal(tx, "XTREME", xFrom, xTo);
      check("gasto anulado → sus asientos se anulan", r4.voided === 2 && r4.created === 0);

      // Closed period: a change inside it is reported, not applied.
      await tx.periodClose.create({ data: { sede: "XTREME", lockedThrough: D("2026-09-30") } });
      await tx.expense.create({ data: { sede: "XTREME", category: "RENT", description: "Arriendo tardío (prueba)", amountCents: 40000, date: D("2026-09-15"), status: "PENDING" } });
      const r5 = await syncJournal(tx, "XTREME", xFrom, xTo);
      check("mes cerrado: no se contabiliza, se reporta", r5.created === 0 && r5.locked.some((l) => l.includes("Arriendo tardío")), r5.locked.join(" | "));
      throw new Rollback("fin");
    }, { timeout: 180_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  const after = await prisma.journalEntry.count({ where: { source: { in: [...AUTO] } } });
  check("nada quedó en la base (rollback)", after === autoBefore, `${autoBefore} → ${after}`);

  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main();
