/**
 * Impuestos (formulario 104 + ATS) con los datos reales de 2026 (solo lectura).
 *  - el IVA de ventas del mes = el IVA por pagar (2.1.06) del libro diario
 *  - el crédito tributario se arrastra mes a mes (605 = 615 del mes anterior)
 *  - el ATS de Xtreme de cada mes valida contra el XSD del SRI (at.xsd)
 *
 * Uso:  npx tsx scripts/test-impuestos.ts
 */
import "dotenv/config";
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { prisma } from "../src/lib/prisma";
import { ivaMonth, IVA_START } from "../src/lib/taxes/iva";
import { atsName, buildAts, reportablePurchases } from "../src/lib/taxes/ats";
import { trialBalance } from "../src/lib/accounting/reports";
import { postingWindow, syncJournal } from "../src/lib/accounting/posting";
import { ENTITIES, monthRangeUtc, shiftMonth } from "../src/lib/finance/entities";
import { ecuadorDateString } from "../src/lib/timezone";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const usd = (c: number) => (c / 100).toFixed(2);
class Rollback extends Error {}

async function main() {
  check("razón social para el ATS", atsName("La Cueva-Xtreme S.A.S.") === "LA CUEVA XTREME S A S");
  const last = ecuadorDateString().slice(0, 7);
  const dir = mkdtempSync(join(tmpdir(), "ats-"));
  for (const sede of ["XTREME", "FITNESS_CENTER"] as const) {
    console.log(`\n── ${ENTITIES[sede].name}`);
    // The journal must be in sync to compare (rolled back afterwards).
    try {
      await prisma.$transaction(async (tx) => {
        const { from, to } = await postingWindow(tx, sede);
        await syncJournal(tx, sede, from, to);
        let prevCarry: number | null = null;
        for (let ym = IVA_START; ym <= last; ym = shiftMonth(ym, 1)) {
          const m = await ivaMonth(sede, ym);
          const { start, end } = monthRangeUtc(ym);
          const tb = await trialBalance(tx, sede, start, new Date(end.getTime() - 86_400_000));
          const ivaJournal = tb.find((r) => r.code === "2.1.06")?.creditCents ?? 0;
          if (ivaJournal !== m.sales.ivaCents) check(`${ym}: IVA ventas = IVA del libro`, false, `${usd(m.sales.ivaCents)} vs ${usd(ivaJournal)}`);
          if (prevCarry !== null && m.credit605 !== prevCarry) check(`${ym}: 605 = 615 del mes anterior`, false);
          prevCarry = m.carry615;
          const flagged = m.purchases.docs.filter((d) => d.problems.length).length;
          console.log(`   ${ym}: ventas ${usd(m.sales.baseCents)} + IVA ${usd(m.sales.ivaCents)} · compras con crédito ${m.purchases.credit.count} (IVA ${usd(m.purchases.credit.ivaCents)}) · 605 ${usd(m.credit605)} · a pagar ${usd(m.toPay)} · 615 ${usd(m.carry615)}${flagged ? ` · ${flagged} con datos incompletos` : ""}`);
          if (sede === "XTREME") {
            const [y, mo] = ym.split("-").map(Number);
            const xml = buildAts({ ruc: ENTITIES[sede].ruc!, legalName: ENTITIES[sede].legalName, year: y, month: mo, establishments: ["001"], purchases: m.purchases.docs });
            const f = join(dir, `ats-${ym}.xml`);
            writeFileSync(f, xml);
            try {
              execFileSync("xmllint", ["--noout", "--schema", join(__dirname, "fixtures/sri-xsd/ats.xsd"), f], { stdio: "pipe" });
            } catch (e) {
              check(`${ym}: ATS valida contra at.xsd`, false, String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 500));
            }
            const n = reportablePurchases(m.purchases.docs).length;
            if ((xml.match(/<detalleCompras>/g) ?? []).length !== n) check(`${ym}: una línea por compra reportable`, false);
          }
        }
        throw new Rollback();
      }, { timeout: 300_000 });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }
  check("IVA de ventas cuadra con el libro y el crédito se arrastra (todos los meses)", fallos === 0);
  check("ATS de Xtreme válido contra el XSD en todos los meses de 2026", fallos === 0);
  const D = (v: string) => new Date(`${v}T00:00:00Z`);
  const doc = (o: Partial<import("../src/lib/taxes/iva").PurchaseDoc>) => ({
    expenseId: "x", date: D("2026-09-10"), supplierName: "Proveedor", supplierRuc: "1790016919001", documentType: "FACTURA" as const,
    documentNumber: "001-002-000012345", accessKey: "1009202601179001691900120010020000123451234567813", totalCents: 11500,
    baseTaxedCents: 10000, baseZeroCents: 0, ivaCents: 1500, assetCents: 0, paymentMethod: "BANK_TRANSFER", problems: [], ...o,
  });
  const sample = buildAts({
    ruc: "1793142958001", legalName: "La Cueva-Xtreme S.A.S.", year: 2026, month: 9, establishments: ["001"],
    purchases: [
      doc({}),
      doc({ documentType: "NOTA_VENTA", supplierRuc: "1712345678001", documentNumber: "001-001-000000077", accessKey: null, totalCents: 2000, baseTaxedCents: 0, baseZeroCents: 2000, ivaCents: 0, paymentMethod: "CASH" }),
      doc({ documentNumber: "002-001-000000009", accessKey: null, assetCents: 80000, baseTaxedCents: 80000, ivaCents: 12000, totalCents: 92000 }),
      doc({ documentNumber: null }), // incomplete → not reported
    ],
  });
  writeFileSync(join(dir, "muestra.xml"), sample);
  try {
    execFileSync("xmllint", ["--noout", "--schema", join(__dirname, "fixtures/sri-xsd/ats.xsd"), join(dir, "muestra.xml")], { stdio: "pipe" });
    check("ATS con compras (factura, nota de venta, activo) valida", true);
  } catch (e) {
    check("ATS con compras (factura, nota de venta, activo) valida", false, String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 500));
  }
  check("3 compras reportadas (la incompleta queda fuera)", (sample.match(/<detalleCompras>/g) ?? []).length === 3);
  check("activo fijo con sustento 03; nota de venta con sustento 02 y sin IVA", sample.includes("<codSustento>03</codSustento>") && /<codSustento>02<\/codSustento>.*?<tipoComprobante>02<\/tipoComprobante>.*?<montoIva>0.00<\/montoIva>/.test(sample));
  const empty = buildAts({ ruc: "1793142958001", legalName: "La Cueva-Xtreme S.A.S.", year: 2026, month: 1, establishments: ["001"], purchases: [] });
  writeFileSync(join(dir, "vacio.xml"), empty);
  try {
    execFileSync("xmllint", ["--noout", "--schema", join(__dirname, "fixtures/sri-xsd/ats.xsd"), join(dir, "vacio.xml")], { stdio: "pipe" });
    check("ATS sin compras también valida", true);
  } catch (e) {
    check("ATS sin compras también valida", false, String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 300));
  }
}

main()
  .catch((e) => check("ejecución", false, String(e).slice(0, 500)))
  .finally(async () => {
    await prisma.$disconnect();
    console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
    process.exit(fallos ? 1 : 0);
  });
