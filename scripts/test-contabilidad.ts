/**
 * Libro diario — checks.
 *  A. Pure validation (balanced, one side per line).
 *  B. Real DB, read-only: the opening entry reproduces the signed 2025
 *     statements and every report balances.
 *  C. Manual entries inside a rolled-back transaction: numbering, guards,
 *     third-party balances, voiding, and the DB one-side constraint.
 *
 * Uso:  npx tsx scripts/test-contabilidad.ts
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createEntry, sameLines, syncOpeningEntry, validateLines, voidEntry } from "../src/lib/accounting/journal";
import { partyBalances, statements, trialBalance } from "../src/lib/accounting/reports";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
async function throws(nombre: string, fn: () => Promise<unknown> | unknown, re: RegExp) {
  try {
    await fn();
    check(nombre, false, "no lanzó error");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    check(nombre, re.test(m), m.slice(0, 120));
  }
}
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
class Rollback extends Error {}

async function main() {
  // The live books may already hold automatic entries (Contabilidad syncs on open).
  const entriesBefore = await prisma.journalEntry.count({ where: { sede: "XTREME" } });
  console.log("\n── A. Validación");
  await throws("no cuadra → error", () => validateLines([{ accountId: "a", debitCents: 100 }, { accountId: "b", creditCents: 90 }]), /no cuadra/);
  await throws("una sola línea → error", () => validateLines([{ accountId: "a", debitCents: 100 }]), /al menos dos/);
  await throws("debe y haber en la misma línea → error", () => validateLines([{ accountId: "a", debitCents: 100, creditCents: 100 }, { accountId: "b", creditCents: 0, debitCents: 0 }, { accountId: "c", creditCents: 0 }]), /al menos dos|no a los dos/);
  await throws("negativo → error", () => validateLines([{ accountId: "a", debitCents: -100 }, { accountId: "b", creditCents: -100 }]), /negativos/);
  check("cuadra → total", validateLines([{ accountId: "a", debitCents: 150 }, { accountId: "b", creditCents: 100 }, { accountId: "c", creditCents: 50 }]).totalCents === 150);
  check("comparación de líneas sin importar el orden", sameLines(
    [{ accountId: "a", debitCents: 1, creditCents: 0, party: null }, { accountId: "b", debitCents: 0, creditCents: 1, party: "X" }],
    [{ accountId: "b", debitCents: 0, creditCents: 1, party: "X" }, { accountId: "a", debitCents: 1, creditCents: 0, party: null }],
  ));

  console.log("\n── B. Apertura y reportes (BD real, solo lectura)");
  const s25 = await statements(prisma, "XTREME", D("2025-12-31"));
  check("activo al 31-dic-2025 = 20.009,93", s25.totals.assets === 2000993, String(s25.totals.assets));
  check("pasivo = 95.141,54", s25.totals.liabilities === 9514154, String(s25.totals.liabilities));
  check("patrimonio = −75.131,61", s25.totals.equity === -7513161, String(s25.totals.equity));
  check("cuadra por construcción", s25.totals.check === 0);
  const tb = await trialBalance(prisma, "XTREME", D("1900-01-01"), D("2026-09-30"));
  const det = tb.filter((r) => r.postable);
  check("comprobación: debe = haber", det.reduce((s, r) => s + r.debitCents, 0) === det.reduce((s, r) => s + r.creditCents, 0));
  check("grupos suman sus hijos (1.1.02 Bancos = Pacífico)", tb.find((r) => r.code === "1.1.02")?.closingCents === tb.find((r) => r.code === "1.1.02.01")?.closingCents);
  const loans = await partyBalances(prisma, "XTREME", "SHAREHOLDER_LOANS", D("2026-09-30"));
  check("préstamos de accionistas: 64.899,15 sin desglosar", loans.length === 1 && loans[0].party === "Sin desglosar" && loans[0].balanceCents === 6489915);
  const opening = await prisma.journalEntry.findMany({ where: { sede: "XTREME", source: "OPENING", status: "POSTED" } });
  check("un solo asiento de apertura vigente (N.º 1)", opening.length === 1 && opening[0].number === 1);
  check("apertura idempotente", (await syncOpeningEntry(prisma, "XTREME")).status === "unchanged");
  const fit = await statements(prisma, "FITNESS_CENTER", D("2026-09-30"));
  check("Fitness: sin saldos, cuadra", fit.totals.check === 0);

  console.log("\n── C. Asientos manuales (transacción revertida)");
  try {
    await prisma.$transaction(async (tx) => {
      const acct = async (sede: "XTREME" | "FITNESS_CENTER", code: string) =>
        (await tx.ledgerAccount.findUniqueOrThrow({ where: { sede_code: { sede, code } } })).id;
      const caja = await acct("XTREME", "1.1.01");
      const loansAcct = await acct("XTREME", "2.2.01");
      const group = await acct("XTREME", "1.1");
      const fitCaja = await acct("FITNESS_CENTER", "1.1.01");
      const before = await statements(tx, "XTREME", D("2026-10-31"));

      const lastNumber = (await tx.journalEntry.aggregate({ where: { sede: "XTREME" }, _max: { number: true } }))._max.number ?? 0;
      const e = await createEntry(tx, {
        sede: "XTREME", date: D("2026-10-01"), description: "Préstamo de Santiago (prueba)", source: "MANUAL",
        lines: [{ accountId: caja, debitCents: 10000 }, { accountId: loansAcct, creditCents: 10000, party: "Santiago Carrillo" }],
      });
      check("numeración correlativa (siguiente número)", e.number === lastNumber + 1, `${e.number} tras ${lastNumber}`);
      const after = await statements(tx, "XTREME", D("2026-10-31"));
      check("activo +100 y sigue cuadrando", after.totals.assets === before.totals.assets + 10000 && after.totals.check === 0);
      const lb = await partyBalances(tx, "XTREME", "SHAREHOLDER_LOANS", D("2026-10-31"));
      check("saldo por persona: Santiago 100", lb.find((l) => l.party === "Santiago Carrillo")?.balanceCents === 10000);
      const sep = await partyBalances(tx, "XTREME", "SHAREHOLDER_LOANS", D("2026-09-30"));
      check("al 30-sep todavía no existe", !sep.some((l) => l.party === "Santiago Carrillo"));

      await throws("cuenta de grupo → error", () => createEntry(tx, {
        sede: "XTREME", date: D("2026-10-01"), description: "x", source: "MANUAL",
        lines: [{ accountId: group, debitCents: 100 }, { accountId: caja, creditCents: 100 }],
      }), /cuenta de grupo/);
      await throws("cuenta de la otra entidad → error", () => createEntry(tx, {
        sede: "XTREME", date: D("2026-10-01"), description: "x", source: "MANUAL",
        lines: [{ accountId: fitCaja, debitCents: 100 }, { accountId: caja, creditCents: 100 }],
      }), /otra entidad/);

      await voidEntry(tx, e.id, "prueba");
      const voided = await statements(tx, "XTREME", D("2026-10-31"));
      check("anulado: deja de contar", voided.totals.assets === before.totals.assets && voided.totals.check === 0);
      await throws("no se anula dos veces", () => voidEntry(tx, e.id, "otra vez"), /./);

      // Last: the DB rejects a two-sided line even if the app were bypassed
      // (this aborts the transaction, so it goes at the end).
      await throws("la base rechaza una línea con debe y haber", () => tx.journalLine.create({
        data: { entryId: e.id, accountId: caja, debitCents: 5, creditCents: 5 },
      }), /one_side|constraint|check/i);
      throw new Rollback("fin");
    }, { timeout: 60_000 });
  } catch (err) {
    if (!(err instanceof Rollback) && !/current transaction is aborted|Rollback|fin/.test(String(err))) throw err;
  }
  check("nada quedó en la base (rollback)", (await prisma.journalEntry.count({ where: { sede: "XTREME" } })) === entriesBefore);

  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main();
