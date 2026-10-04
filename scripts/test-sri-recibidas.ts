/**
 * Facturas recibidas por clave de acceso (importación masiva desde el reporte del SRI).
 *  - consulta REAL de solo lectura a cel.sri.gob.ec (producción) con una factura
 *    recibida de verdad (Banco del Austro → Santiago, sep 2026)
 *  - la importa como gasto dentro de UNA transacción que siempre se revierte
 *
 * Uso:  npx tsx --env-file=.env scripts/test-sri-recibidas.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { authorizedXml, checkAuthorization } from "../src/lib/invoicing/sri-ws";
import { extractAccessKeys, parseSriXml } from "../src/lib/finance/sri-xml";
import { checkCompleteness, importSriDocument } from "../src/lib/finance/sri-core";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
class Rollback extends Error {}

const KEY = "1509202601019005596500120090040057381546972388014";

(async () => {
  const txt = `RUC_EMISOR\tRAZON_SOCIAL\tCOMPROBANTE\tSERIE\tCLAVE_ACCESO\n0190055965001\tBANCO DEL AUSTRO\tFactura\t009-004-005738154\t${KEY}\n0190055965001\tBANCO DEL AUSTRO\tFactura\t009-004-005738155\t${KEY.slice(0, 48)}0`;
  const keys = extractAccessKeys(txt);
  check("del TXT salen solo las claves válidas", keys.length === 1 && keys[0] === KEY, String(keys.length));

  const rep = await checkCompleteness(prisma, keys);
  check("el reporte la marca como faltante (o ya importada)", rep.totalKeys === 1 && rep.missing.length + rep.imported === 1);

  const auth = await checkAuthorization("PRODUCCION", KEY);
  check("el SRI devuelve la factura recibida por su clave", auth.state === "AUTORIZADO", auth.state);
  if (auth.state !== "AUTORIZADO") return finish();
  const doc = parseSriXml(authorizedXml({ number: auth.number, date: auth.date, env: "PRODUCCION", signedXml: auth.signedXml }));
  check("se lee: Banco del Austro, $43.92, comprador Santiago", doc.issuerRuc === "0190055965001" && doc.totalCents === 4392 && doc.buyerId === "1707994461");

  try {
    await prisma.$transaction(async (tx) => {
      const r = await importSriDocument(tx, doc, { sede: "XTREME", userId: "test-user", receiptPath: null });
      check("se importa a la Fitness por la cédula del comprador (aunque se eligió Xtreme)", (r.status === "created" || r.status === "linked" || r.status === "duplicate") && (r.status === "duplicate" || r.sede === "FITNESS_CENTER"), `${r.status} · ${r.detail}`);
      const again = await importSriDocument(tx, doc, { sede: "XTREME", userId: "test-user", receiptPath: null });
      check("la segunda vez es duplicada", again.status === "duplicate", again.detail);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  finish();
})();

async function finish() {
  check("nada quedó en la base", !(await prisma.expense.findFirst({ where: { sriAccessKey: KEY, createdById: "test-user" } })));
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}
