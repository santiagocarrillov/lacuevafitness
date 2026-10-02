/**
 * Gastos con líneas (Módulo 3).
 *  A. Reglas: cuentas por rol (los admins nunca ven 5.2.x), IVA solo con
 *     factura, categoría de cabecera.
 *  B. Contabilidad (BD real, transacción revertida): cada línea va a su
 *     cuenta (gasto y activo fijo), IVA a crédito tributario, total a
 *     proveedores; el libro cuadra.
 *
 * Uso:  npx tsx scripts/test-gastos.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { postingWindow, syncJournal } from "../src/lib/accounting/posting";
import { expenseTotals, hasIvaCredit, headerCategory, isPrivateCode, lineAccounts } from "../src/lib/expenses/core";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
class Rollback extends Error {}

async function main() {
  console.log("\n── A. Reglas");
  const accts = await prisma.ledgerAccount.findMany({
    where: { sede: "XTREME", active: true },
    select: { id: true, code: true, name: true, type: true, postable: true, expenseCategory: true },
  });
  const admin = lineAccounts(accts, { includePrivate: false });
  const full = lineAccounts(accts, { includePrivate: true });
  check("la cuenta 5.2.02 Honorarios de coaches existe", accts.some((a) => a.code === "5.2.02"));
  check("los admins no ven cuentas de personal (5.2.x)", !admin.some((a) => isPrivateCode(a.code)) && full.some((a) => a.code === "5.2.01"));
  check("activos fijos disponibles para compras", admin.some((a) => a.code === "1.2.03"));
  check("depreciación y cuentas de grupo no se usan en compras", !full.some((a) => a.code === "5.3.10" || !a.postable));
  check("IVA a crédito solo con factura o liquidación", hasIvaCredit("FACTURA") && !hasIvaCredit("NOTA_VENTA") && !hasIvaCredit("SIN_DOCUMENTO"));
  check("categoría de cabecera = línea más grande", headerCategory([{ subtotalCents: 100, category: "SUPPLIES", isAsset: false }, { subtotalCents: 900, category: null, isAsset: true }]) === "EQUIPMENT");
  const t = expenseTotals([{ description: "a", accountCode: "5.3.05", subtotalCents: 1000, ivaRate: 15, ivaCents: 150 }, { description: "b", accountCode: "1.2.03", subtotalCents: 50000, ivaRate: 15, ivaCents: 7500 }]);
  check("totales", t.totalCents === 58650 && t.ivaCents === 7650);

  console.log("\n── B. Contabilidad (transacción revertida)");
  try {
    await prisma.$transaction(async (tx) => {
      const sede = "XTREME" as const;
      const { from, to } = await postingWindow(tx, sede);
      await syncJournal(tx, sede, from, to);
      const id = (c: string) => accts.find((a) => a.code === c)!.id;
      const e = await tx.expense.create({
        data: {
          sede, category: "EQUIPMENT", description: "Prueba", amountCents: 58650, subtotalCents: 51000, ivaCents: 7650,
          date: to, status: "PAID", paidAt: to, paymentMethod: "CASH", supplierName: "Proveedor de prueba", documentType: "FACTURA",
          lines: { create: [
            { position: 1, description: "Magnesio", accountId: id("5.3.05"), subtotalCents: 1000, ivaRate: 15, ivaCents: 150 },
            { position: 2, description: "Rack de sentadillas", accountId: id("1.2.03"), subtotalCents: 50000, ivaRate: 15, ivaCents: 7500 },
          ] },
        },
      });
      const r = await syncJournal(tx, sede, from, to);
      check("sin errores", r.errors.length === 0, r.errors.join(" | "));
      const entry = await tx.journalEntry.findFirst({ where: { source: "EXPENSE", sourceId: e.id, status: "POSTED" }, include: { lines: { include: { account: true } } } });
      const dr = (c: string) => entry?.lines.filter((l) => l.account.code === c).reduce((a, l) => a + l.debitCents, 0) ?? 0;
      const cr = (c: string) => entry?.lines.filter((l) => l.account.code === c).reduce((a, l) => a + l.creditCents, 0) ?? 0;
      check("Dr Insumos 10,00 · Dr Equipos 500,00 (activo, no gasto)", dr("5.3.05") === 1000 && dr("1.2.03") === 50000);
      check("Dr IVA crédito 76,50 · Cr Proveedores 586,50", dr("1.3.01") === 7650 && cr("2.1.01") === 58650);
      const pay = await tx.journalEntry.findFirst({ where: { source: "EXPENSE", sourceId: `${e.id}:pago`, status: "POSTED" }, include: { lines: { include: { account: true } } } });
      check("pago en efectivo sale de Caja", pay?.lines.some((l) => l.account.code === "1.1.01" && l.creditCents === 58650) ?? false);
      throw new Rollback();
    }, { timeout: 120_000 });
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
