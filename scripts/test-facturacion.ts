/**
 * Facturación electrónica (Módulo 2a).
 *  A. Pure rules: IVA-inclusive line math, cédula/RUC, access key, consumidor final.
 *  B. XML: the generated factura v1.1.0 validates against the official SRI XSD
 *     (scripts/fixtures/sri-xsd) with xmllint, and parses back with our reader.
 *  C. Books (real DB, ONE rolled-back transaction): an invoice and its
 *     collection post once (INVOICE, not PAYMENT); voiding the invoice hands
 *     the collection back; a prepaid quarter is deferred line by line.
 *
 * Uso:  npx tsx scripts/test-facturacion.ts
 */

import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { invoiceTotals, isValidCedula, isValidRuc, lineAmounts, taxIdError } from "../src/lib/invoicing/core";
import { buildAccessKey, buildInvoiceXml } from "../src/lib/invoicing/xml";
import { decodeAccessKey, isValidAccessKey, parseSriXml } from "../src/lib/finance/sri-xml";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { postingWindow, syncJournal } from "../src/lib/accounting/posting";

let fallos = 0;
export function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

console.log("\n── A. Reglas");
const a = lineAmounts({ quantity: 1, unitPriceCents: 5000, ivaRate: 15 });
check("$50 → base 43,48 + IVA 6,52", a.subtotalCents === 4348 && a.ivaCents === 652, JSON.stringify(a));
check("precio unitario sin IVA con 6 decimales", a.netUnitPrice === "43.480000");
const g = lineAmounts({ quantity: 3, unitPriceCents: 125, ivaRate: 15 });
check("3 Gatorade de $1,25 = $3,75", g.totalCents === 375 && g.subtotalCents + g.ivaCents === 375);
check("cantidad × unitario − descuento = base (regla del SRI)", Math.round(3 * Number(g.netUnitPrice) * 100) - g.netDiscountCents === g.subtotalCents);
const dsc = lineAmounts({ quantity: 1, unitPriceCents: 6000, discountCents: 1000, ivaRate: 15 });
check("$60 con $10 de descuento = $50", dsc.totalCents === 5000 && dsc.subtotalCents === 4348);
check("descuento sin IVA = 52,17 − 43,48", dsc.netDiscountCents === 5217 - 4348, String(dsc.netDiscountCents));
// The SRI recomputes IVA = base × tarifa with a 1-cent tolerance.
let worst = 0;
for (let t = 1; t <= 50000; t++) {
  const l = lineAmounts({ quantity: 1, unitPriceCents: t, ivaRate: 15 });
  worst = Math.max(worst, Math.abs(l.ivaCents - l.subtotalCents * 0.15));
}
check("IVA vs base × 15 % < 1 centavo en todos los montos hasta $500", worst < 1, `peor: ${worst.toFixed(3)} c`);
const t = invoiceTotals([{ quantity: 1, unitPriceCents: 5000, ivaRate: 15 }, { quantity: 2, unitPriceCents: 125, ivaRate: 15 }]);
check("totales de varias líneas suman", t.totalCents === 5250 && t.subtotalCents + t.ivaCents === 5250 && t.byRate.length === 1);

check("cédula de Santiago válida", isValidCedula("1707994461"));
check("cédula con dígito errado inválida", !isValidCedula("1707994462"));
check("RUC persona natural = cédula + 001", isValidRuc("1707994461001"));
check("RUC de la S.A.S. válido", isValidRuc("1793142958001"));
check("RUC terminado en 000 inválido", !isValidRuc("1707994461000"));
check("error legible para cédula mala", taxIdError("CEDULA", "123") !== null && taxIdError("CEDULA", "1707994461") === null);

const key = buildAccessKey({ issueDate: D("2026-10-02"), ruc: "1793142958001", environment: "PRUEBAS", establishment: "001", point: "100", sequential: 7, numericCode: "12345678" });
const dk = decodeAccessKey(key);
check("clave de acceso de 49 dígitos y DV válido", isValidAccessKey(key), key);
check("la clave se decodifica (fecha, RUC, número)", !!dk && dk.issuerRuc === "1793142958001" && dk.docNumber === "001-100-000000007" && dk.issueDate.toISOString().startsWith("2026-10-02"));
check("ambiente de pruebas = 1 en la posición 24", key[23] === "1");

console.log("\n── B. XML contra el XSD oficial del SRI");
const xml = buildInvoiceXml({
  sede: "XTREME",
  environment: "PRUEBAS",
  establishment: "001",
  point: "100",
  establishmentAddress: "Av. Siempre Viva & Colibrí",
  sequential: 7,
  accessKey: key,
  issueDate: D("2026-10-02"),
  buyerIdType: "05",
  buyerId: "1707994461",
  buyerName: "Santiago Carrillo <prueba>",
  buyerEmail: "socio@example.com",
  buyerPhone: "0999999999",
  payForm: "20",
  lines: [
    { code: "MEM", description: "Membresía mensual · octubre 2026", quantity: 1, unitPriceCents: 6000, discountCents: 1000, ivaRate: 15 },
    { code: "GAT", description: "Gatorade", quantity: 3, unitPriceCents: 125, ivaRate: 15 },
  ],
});
const dir = mkdtempSync(join(tmpdir(), "factura-"));
const file = join(dir, "factura.xml");
writeFileSync(file, xml);
try {
  execFileSync("xmllint", ["--noout", "--schema", join(__dirname, "fixtures/sri-xsd/factura_V1.1.0.xsd"), file], { stdio: "pipe" });
  check("valida contra factura_V1.1.0.xsd", true);
} catch (e) {
  const err = e as { stderr?: Buffer };
  check("valida contra factura_V1.1.0.xsd", false, String(err.stderr ?? e).slice(0, 600));
}
const back = parseSriXml(xml);
check("nuestro lector la vuelve a leer", back.totalCents === 5375 && back.docNumber === "001-100-000000007" && back.buyerId === "1707994461", JSON.stringify({ total: back.totalCents, iva: back.ivaCents }));
check("IVA leído = suma de las líneas", back.ivaCents === 652 + g.ivaCents);
check("caracteres especiales escapados", xml.includes("&lt;prueba&gt;") && xml.includes("&amp; Colibrí"));

class Rollback extends Error {}

async function books() {
  console.log("\n── C. Contabilidad (transacción revertida)");
  try {
    await prisma.$transaction(async (tx) => {
      const sede = "XTREME" as const;
      const { from, to } = await postingWindow(tx, sede);
      await syncJournal(tx, sede, from, to);
      const member = await tx.member.findFirstOrThrow({ where: { sede, status: "ACTIVE" } });
      const pt = await tx.emissionPoint.create({ data: { sede, establishment: "001", point: "999", address: "Prueba", environment: "PRUEBAS" } });
      const issueDate = to;
      const mk = async (n: number, totalCents: number, membershipId: string | null, method: "CASH" | "BANK_TRANSFER") => {
        const amt = lineAmounts({ quantity: 1, unitPriceCents: totalCents, ivaRate: 15 });
        const inv = await tx.invoice.create({
          data: {
            sede, emissionPointId: pt.id, sequential: n, environment: "PRUEBAS", issueDate,
            accessKey: buildAccessKey({ issueDate, ruc: "1793142958001", environment: "PRUEBAS", establishment: "001", point: "999", sequential: n }),
            memberId: member.id, buyerIdType: "05", buyerId: "1707994461", buyerName: "Prueba Facturación",
            subtotalCents: amt.subtotalCents, ivaCents: amt.ivaCents, totalCents: totalCents, sriPayForm: method === "CASH" ? "01" : "20",
            lines: { create: [{ position: 1, code: "MEM", description: "Membresía (prueba)", quantity: 1, unitPriceCents: totalCents, ivaRate: 15,
              subtotalCents: amt.subtotalCents, ivaCents: amt.ivaCents, totalCents, incomeAccountCode: "4.1.01", membershipId }] },
          },
        });
        const pay = await tx.payment.create({
          data: { sede, memberId: member.id, membershipId, amountCents: totalCents, method, status: method === "CASH" ? "SUCCEEDED" : "PENDING", paidAt: issueDate, invoiceId: inv.id },
        });
        return { inv, pay };
      };
      const a = await mk(1, 5000, null, "CASH");
      const r1 = await syncJournal(tx, sede, from, to);
      check("sin errores al contabilizar la factura", r1.errors.length === 0, r1.errors.join(" | "));
      const invEntries = await tx.journalEntry.findMany({ where: { source: "INVOICE", sourceId: a.inv.id, status: "POSTED" }, include: { lines: { include: { account: true } } } });
      const payEntries = await tx.journalEntry.count({ where: { source: "PAYMENT", sourceId: a.pay.id, status: "POSTED" } });
      check("la factura genera UN asiento", invEntries.length === 1);
      check("el cobro facturado no genera asiento propio (sin doble ingreso)", payEntries === 0);
      const L = invEntries[0]?.lines ?? [];
      const by = (code: string, side: "debitCents" | "creditCents") => L.filter((l) => l.account.code === code).reduce((x, l) => x + l[side], 0);
      check("Dr Caja $50 · Cr IVA 6,52 · Cr Mensualidades 43,48", by("1.1.01", "debitCents") === 5000 && by("2.1.06", "creditCents") === 652 && by("4.1.01", "creditCents") === 4348);

      // Void → the collection posts on its own again.
      await tx.invoice.update({ where: { id: a.inv.id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: "prueba" } });
      await tx.payment.update({ where: { id: a.pay.id }, data: { invoiceId: null } });
      await syncJournal(tx, sede, from, to);
      check("al anular, el asiento de la factura se anula", (await tx.journalEntry.count({ where: { source: "INVOICE", sourceId: a.inv.id, status: "POSTED" } })) === 0);
      check("…y el cobro vuelve a contabilizarse solo", (await tx.journalEntry.count({ where: { source: "PAYMENT", sourceId: a.pay.id, status: "POSTED" } })) === 1);

      // Prepaid quarter on an invoice line → deferred.
      const plan = await tx.membershipPlan.create({ data: { name: "Trimestral (prueba)", priceCents: 13500, billingCycle: "QUARTERLY", durationDays: 90 } });
      const ms = await tx.membership.create({ data: { memberId: member.id, planId: plan.id, startsAt: issueDate, endsAt: new Date(issueDate.getTime() + 90 * 86400000) } });
      const b = await mk(2, 13500, ms.id, "BANK_TRANSFER");
      await syncJournal(tx, sede, from, to);
      const e2 = await tx.journalEntry.findFirst({ where: { source: "INVOICE", sourceId: b.inv.id, status: "POSTED" }, include: { lines: { include: { account: true } } } });
      const deferred = e2?.lines.filter((l) => l.account.code === "2.1.07").reduce((x, l) => x + l.creditCents, 0) ?? 0;
      const net = lineAmounts({ quantity: 1, unitPriceCents: 13500, ivaRate: 15 }).subtotalCents;
      check("trimestre prepagado: 2 de 3 meses van a ingresos diferidos", deferred === net - (net - 2 * Math.floor(net / 3)), `${deferred} de ${net}`);
      check("transferencia sin conciliar va a la cuenta puente", (e2?.lines.find((l) => l.debitCents > 0)?.account.code) === "1.1.05");
      throw new Rollback();
    }, { timeout: 120_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

books()
  .catch((e) => check("contabilidad", false, String(e).slice(0, 400)))
  .finally(async () => {
    await prisma.$disconnect();
    console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
    process.exit(fallos ? 1 : 0);
  });
