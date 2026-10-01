/**
 * Finanzas 1c — SRI received invoices.
 *  A. XML parser and access keys (fixtures built from a real invoice, buyer data replaced).
 *  B. Import against the real DB inside ONE transaction that is always rolled
 *     back: dedupe, entity by buyer ID, bank-first and SRI-first linking (one
 *     expense, never two), learned categories, completeness report.
 *
 * Uso:  npx tsx scripts/test-sri.ts
 */

import "dotenv/config";
import fs from "fs";
import { prisma } from "../src/lib/prisma";
import {
  accessKeyCheckDigit,
  decodeAccessKey,
  extractAccessKeys,
  isValidAccessKey,
  parseSriXml,
  type SriDocument,
} from "../src/lib/finance/sri-xml";
import { checkCompleteness, importSriDocument } from "../src/lib/finance/sri-core";
import { classifyInTx } from "../src/lib/finance/bank-core";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const fx = (f: string) => fs.readFileSync(`scripts/fixtures/${f}`, "utf8");
/** Valid key for a given date/codDoc/RUC/sequence. */
function key(ddmmyyyy: string, cod: string, ruc: string, seq: string) {
  const k48 = `${ddmmyyyy}${cod}${ruc}2001001${seq.padStart(9, "0")}123456781`;
  return k48 + accessKeyCheckDigit(k48);
}

function partA() {
  console.log("\n── A. XML y claves de acceso");
  const real = parseSriXml(fx("sri-factura-autorizada.xml"));
  check("factura real: total = subtotal + IVA", real.totalCents === 574 && real.subtotalCents === 499 && real.ivaCents === 75);
  check("factura real: emisor y número", real.issuerRuc === "1792261848001" && real.docNumber === "002-001-001249957");
  check("factura real: fecha 8 jul 2026 y pago con tarjeta (19)", real.issueDate.toISOString() === "2026-07-08T00:00:00.000Z" && real.payForm === "19");
  const raw = parseSriXml(fx("sri-factura-sin-envoltura.xml"));
  check("sin envoltura: IVA 0 % + 15 % sumado", raw.ivaCents === 1500 && raw.totalCents === 13500 && raw.termDays === 30);
  check("clave real con dígito verificador válido", isValidAccessKey("0807202601179226184800120020010012499570000000119"));
  check("clave alterada se rechaza", !isValidAccessKey("0807202601179226184800120020010012499570000000118"));
  const d = decodeAccessKey("0807202601179226184800120020010012499570000000119");
  check("decodifica fecha, tipo, RUC y número", d?.codDoc === "01" && d.issuerRuc === "1792261848001" && d.docNumber === "002-001-001249957");
  const txt = "COMPROBANTE\tSERIE\tCLAVE_ACCESO\nFactura\t002-001\t0807202601179226184800120020010012499570000000119\n" +
    "Factura\t002-001\t0807202601179226184800120020010012499570000000118\n";
  check("reporte TXT: solo claves válidas, sin depender de columnas", extractAccessKeys(txt).length === 1);
  let threw = "";
  try { parseSriXml(fx("sri-factura-autorizada.xml").replace("<estado>AUTORIZADO</estado>", "<estado>NO AUTORIZADO</estado>")); } catch (e) { threw = String(e); }
  check("comprobante no autorizado se rechaza", /no está autorizado/.test(threw));
  try { parseSriXml(fx("sri-factura-sin-envoltura.xml").replace("<codDoc>01</codDoc>", "<codDoc>07</codDoc>")); threw = ""; } catch (e) { threw = String(e); }
  check("retención no se importa como gasto", /solo se importan facturas/.test(threw));
}

class Rollback extends Error {}

async function partB() {
  console.log("\n── B. Importar (transacción revertida)");
  const before = await prisma.expense.count();
  const real = parseSriXml(fx("sri-factura-autorizada.xml"));
  const energy = parseSriXml(fx("sri-factura-sin-envoltura.xml"));
  const uid = "test-user";

  try {
    await prisma.$transaction(async (tx) => {
      // 1. New supplier, unknown buyer → chosen entity (Xtreme has no tax IDs yet).
      const r1 = await importSriDocument(tx, real, { sede: "XTREME", userId: uid });
      const e1 = await tx.expense.findUnique({ where: { sriAccessKey: real.accessKey } });
      check("factura nueva → gasto con IVA", r1.status === "created" && e1?.amountCents === 574 && e1.ivaCents === 75 && e1.subtotalCents === 499);
      check("tarjeta de crédito → pagada", e1?.status === "PAID" && e1.paymentMethod === "CREDIT_CARD");
      check("categoría por palabras clave (Security Data → software)", e1?.category === "SOFTWARE" && e1.documentType === "FACTURA");

      // 2. Same XML again.
      check("misma factura otra vez → duplicada", (await importSriDocument(tx, real, { sede: "XTREME", userId: uid })).status === "duplicate");

      // 3. Fitness has tax IDs: an invoice to someone else is rejected.
      const other: SriDocument = { ...real, accessKey: key("09072026", "01", "1792261848001", "1249958") };
      const r3 = await importSriDocument(tx, other, { sede: "FITNESS_CENTER", userId: uid });
      check("factura a otro comprador no entra a la Fitness", r3.status === "rejected", r3.detail);

      // 4. Buyer ID decides the entity: Santiago's cédula → Fitness even if Xtreme was chosen.
      const mine: SriDocument = { ...real, accessKey: key("10072026", "01", "1792261848001", "1249959"), buyerId: "1707994461" };
      const r4 = await importSriDocument(tx, mine, { sede: "XTREME", userId: uid });
      check("cédula de Santiago → Fitness", r4.status === "created" && r4.sede === "FITNESS_CENTER");

      // 5. Learned category: fix it once, the next invoice from that RUC inherits it.
      await tx.expense.update({ where: { id: e1!.id }, data: { category: "PROFESSIONAL" } });
      const next: SriDocument = { ...real, accessKey: key("11072026", "01", "1792261848001", "1249960") };
      await importSriDocument(tx, next, { sede: "XTREME", userId: uid });
      check("categoría aprendida por RUC", (await tx.expense.findUnique({ where: { sriAccessKey: next.accessKey } }))?.category === "PROFESSIONAL");

      // 6. Bank first, invoice later → the invoice attaches to the bank expense.
      const acct = await tx.bankAccount.create({ data: { sede: "XTREME", name: "TEST", bank: "Banco del Pacífico", statementFormat: "PACIFICO" } });
      const debit = await tx.bankTransaction.create({
        data: { accountId: acct.id, postedAt: new Date("2026-09-20T15:00:00Z"), amountCents: -13500, description: "Débito servicios", fingerprint: `test-sri-${Date.now()}-1` },
      });
      await classifyInTx(tx, uid, debit.id, { type: "EXPENSE", category: "OTHER", description: "Débito servicios" });
      const r6 = await importSriDocument(tx, energy, { sede: "XTREME", userId: uid });
      const e6 = await tx.expense.findFirst({ where: { bankTransactionId: debit.id } });
      check("banco primero: la factura se enlaza (no duplica)", r6.status === "linked" && e6?.sriAccessKey === energy.accessKey, r6.detail);
      check("…y el gasto toma IVA, proveedor y categoría", e6?.ivaCents === 1500 && e6.supplierRuc === "1790000000001" && e6.category === "UTILITIES");
      check("…un solo gasto de $135 en la entidad", (await tx.expense.count({ where: { sede: "XTREME", amountCents: 13500, voidedAt: null } })) === 1);

      // 7. Invoice first (transfer, 30 days) → payable; the bank debit closes it.
      const inv: SriDocument = { ...energy, accessKey: key("16092026", "01", "1790000000001", "1235"), buyerId: "1707994461001", totalCents: 4321, subtotalCents: 3757, ivaCents: 564 };
      await importSriDocument(tx, inv, { sede: "FITNESS_CENTER", userId: uid });
      const p7 = await tx.expense.findUnique({ where: { sriAccessKey: inv.accessKey } });
      check("transferencia a 30 días → por pagar con vencimiento", p7?.status === "PENDING" && p7.dueDate?.toISOString().slice(0, 10) === "2026-10-15");
      const fAcct = await tx.bankAccount.create({ data: { sede: "FITNESS_CENTER", name: "TEST F", bank: "Banco Pichincha", statementFormat: "PICHINCHA", kind: "PERSONAL_MIXED" } });
      const pay = await tx.bankTransaction.create({
        data: { accountId: fAcct.id, postedAt: new Date("2026-09-25T15:00:00Z"), amountCents: -4321, description: "TRANSF. A EMPRESA ELECTRICA", fingerprint: `test-sri-${Date.now()}-2` },
      });
      await classifyInTx(tx, uid, pay.id, { type: "EXPENSE", category: "OTHER", description: "Pago luz" });
      const p7b = await tx.expense.findUnique({ where: { sriAccessKey: inv.accessKey } });
      check("SRI primero: el débito cierra la cuenta por pagar", p7b?.status === "PAID" && p7b.bankTransactionId === pay.id);
      check("…sin crear otro gasto", (await tx.expense.count({ where: { sede: "FITNESS_CENTER", amountCents: 4321, voidedAt: null } })) === 1);

      // 8. Completeness against the SRI report.
      const missingKey = key("20092026", "01", "1790000000001", "9999");
      const retKey = key("21092026", "07", "1790000000001", "77");
      const rep = await checkCompleteness(tx, [real.accessKey, missingKey, retKey]);
      check("reporte: 1 importada, 1 faltante, 1 que no es gasto", rep.imported === 1 && rep.missing.length === 1 && rep.notExpenses === 1 && rep.missing[0].docNumber === "001-001-000009999");

      throw new Rollback("fin");
    }, { timeout: 60_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  check("nada quedó en la base (rollback)", (await prisma.expense.count()) === before);
}

async function main() {
  partA();
  await partB();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main();
