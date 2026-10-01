/**
 * Finanzas — plan de cuentas, saldos iniciales y balance.
 *  A. Read-only against the real DB: the Xtreme opening balances tie to the
 *     signed 2025 statements.
 *  B. Year movements inside a rolled-back transaction: shareholder loans by
 *     person, contributions, payables and the bank statement balance.
 *
 * Uso:  npx tsx scripts/test-balance.ts
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeBalanceSheet } from "../src/lib/finance/ledger";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

class Rollback extends Error {}

async function main() {
  console.log("\n── A. Saldos iniciales (BD real, solo lectura)");
  const bs = await computeBalanceSheet("XTREME", "2026-09");
  const open = (t: string) => bs.lines.filter((l) => l.type === t).reduce((s, l) => s + l.openingCents, 0);
  check("fecha de saldos iniciales 31-dic-2025", bs.asOf?.toISOString().slice(0, 10) === "2025-12-31");
  check("activo inicial = 20.009,93", open("ASSET") === 2000993, String(open("ASSET")));
  check("pasivo inicial = 95.141,54", open("LIABILITY") === 9514154, String(open("LIABILITY")));
  check("patrimonio inicial = −75.131,61", open("EQUITY") === -7513161, String(open("EQUITY")));
  check("saldos iniciales cuadran", bs.totals.openingDifference === 0);
  check("préstamos de accionistas sin desglosar todavía", bs.loans.length >= 1 && bs.loans.some((l) => l.person.startsWith("Sin desglosar") && l.openingCents === 6489915));
  const bank = bs.lines.find((l) => l.role === "BANK");
  check("Banco del Pacífico enlazado a la cuenta bancaria", !!bank && bank.note !== "Sin cuenta bancaria enlazada", bank?.note);
  const fit = await computeBalanceSheet("FITNESS_CENTER", "2026-09");
  check("Fitness sin saldos iniciales (persona natural)", fit.asOf === null && fit.lines.length === 0);

  console.log("\n── B. Movimientos del año (transacción revertida)");
  try {
    await prisma.$transaction(async (tx) => {
      const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
      await tx.capitalMovement.createMany({
        data: [
          { sede: "XTREME", person: "Santiago Carrillo", kind: "SHAREHOLDER_LOAN", amountCents: 50000, date: d("2026-09-10") },
          { sede: "XTREME", person: "Santiago Carrillo", kind: "LOAN_REPAYMENT", amountCents: 10000, date: d("2026-09-20") },
          { sede: "XTREME", person: "Isabel Cárdenas", kind: "SHAREHOLDER_LOAN", amountCents: 7000, date: d("2026-09-15") },
          { sede: "XTREME", person: "Isabel Cárdenas", kind: "CONTRIBUTION", amountCents: 20000, date: d("2026-09-15") },
          // Outside the period: before the opening date and after September.
          { sede: "XTREME", person: "Santiago Carrillo", kind: "SHAREHOLDER_LOAN", amountCents: 99900, date: d("2025-12-15") },
          { sede: "XTREME", person: "Santiago Carrillo", kind: "SHAREHOLDER_LOAN", amountCents: 88800, date: d("2026-10-02") },
        ],
      });
      await tx.expense.create({ data: { sede: "XTREME", category: "UTILITIES", description: "Luz (prueba)", amountCents: 3000, date: d("2026-09-05"), status: "PENDING" } });
      const pac = await tx.bankAccount.findFirst({ where: { sede: "XTREME", statementFormat: "PACIFICO", active: true } });
      if (pac) {
        await tx.bankTransaction.create({
          data: { accountId: pac.id, postedAt: new Date("2026-09-29T20:00:00Z"), amountCents: 100, description: "prueba", balanceCents: 123456, fingerprint: `test-bal-${Date.now()}` },
        });
      }

      const b = await computeBalanceSheet("XTREME", "2026-09", tx);
      const line = (role: string) => b.lines.find((l) => l.role === role);
      check("préstamos: +500 − 100 + 70 en el período", line("SHAREHOLDER_LOANS")?.movementCents === 47000, String(line("SHAREHOLDER_LOANS")?.movementCents));
      const sant = b.loans.find((l) => l.person === "Santiago Carrillo");
      const isa = b.loans.find((l) => l.person === "Isabel Cárdenas");
      check("por persona: Santiago +400, Isabel +70", sant?.movementCents === 40000 && isa?.movementCents === 7000);
      check("fuera del período no cuenta (dic-2025 y oct-2026)", !b.loans.some((l) => l.movementCents === 99900 + 40000));
      check("aporte para futura capitalización como patrimonio", b.lines.find((l) => l.code === "3.1.02")?.closingCents === 20000);
      check("cuentas por pagar: + gasto pendiente del año", line("PAYABLES")?.movementCents === 3000 && line("PAYABLES")?.closingCents === 19590 + 3000);
      if (pac) check("banco: saldo del último estado de cuenta", line("BANK")?.closingCents === 123456, line("BANK")?.note);
      throw new Rollback("fin");
    }, { timeout: 60_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  const after = await computeBalanceSheet("XTREME", "2026-09");
  check("nada quedó en la base (rollback)", after.lines.find((l) => l.role === "SHAREHOLDER_LOANS")?.movementCents === bs.lines.find((l) => l.role === "SHAREHOLDER_LOANS")?.movementCents);

  console.log(`\nXtreme al 30-sep-2026: activo ${bs.totals.assets / 100} · pasivo ${bs.totals.liabilities / 100} · patrimonio ${bs.totals.equity / 100} · diferencia por cuadrar ${bs.totals.difference / 100}`);
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main();
