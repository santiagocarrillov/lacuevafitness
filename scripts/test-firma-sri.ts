/**
 * Firma XAdES-BES (Módulo 2b) con un certificado de PRUEBA autofirmado:
 *  - abre el .p12 y elige la clave/certificado correctos
 *  - la firma verifica de forma independiente con xml-crypto (SignedInfo +
 *    las 3 referencias: documento, KeyInfo, SignedProperties)
 *  - el XML firmado sigue validando contra el XSD del SRI
 *  - alterar el documento rompe la firma
 *
 * Uso:  npx tsx scripts/test-firma-sri.ts
 */
import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";
import { SignedXml } from "xml-crypto";
import { loadP12, signSriXml } from "../src/lib/invoicing/xades";
import { buildAccessKey, buildInvoiceXml } from "../src/lib/invoicing/xml";
import { parseSriXml } from "../src/lib/finance/sri-xml";
import { makeTestP12 } from "./lib-test-cert";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const p12 = makeTestP12("clave-de-prueba");
let bad = false;
try { loadP12(p12, "otra"); } catch { bad = true; }
check("clave equivocada → error legible", bad);
const cert = loadP12(p12, "clave-de-prueba");
check("abre el .p12 y encuentra clave + certificado", !!cert.privateKey && cert.subject.includes("CN=PRUEBA LA CUEVA"), cert.subject);
check("número de serie en decimal", cert.serial === BigInt("0x0a1b2c3d4e").toString(), cert.serial);

const issueDate = new Date("2026-10-02T00:00:00Z");
const accessKey = buildAccessKey({ issueDate, ruc: "1793142958001", environment: "PRUEBAS", establishment: "001", point: "100", sequential: 1 });
const xml = buildInvoiceXml({
  sede: "XTREME", environment: "PRUEBAS", establishment: "001", point: "100", establishmentAddress: "Calle \"A\" & B",
  sequential: 1, accessKey, issueDate, buyerIdType: "05", buyerId: "1707994461", buyerName: "Año Ñandú <prueba> 'x'",
  buyerEmail: "socio@example.com", payForm: "01",
  lines: [{ code: "MEM", description: "Membresía · octubre", quantity: 1, unitPriceCents: 5000, ivaRate: 15 }],
});
const signed = signSriXml(xml, cert);
check("la firma queda como último hijo de <factura>", /<\/ds:Signature><\/factura>$/.test(signed));

function verify(doc: string) {
  const dom = new DOMParser().parseFromString(doc, "text/xml");
  const node = (xpath.select("//*[local-name(.)='Signature' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']", dom as unknown as Node) as Node[])[0];
  const sig = new SignedXml({ publicCert: forge.pki.certificateToPem(cert.certificate) });
  sig.loadSignature(node as unknown as Node);
  try {
    return { ok: sig.checkSignature(doc), refs: sig.getReferences().length };
  } catch (e) {
    return { ok: false, refs: 0, err: String(e) };
  }
}
const v = verify(signed);
check("xml-crypto verifica la firma (SignedInfo + 3 referencias)", v.ok && v.refs === 3, JSON.stringify(v));

const tampered = signed.replace("<importeTotal>50.00</importeTotal>", "<importeTotal>40.00</importeTotal>");
check("alterar el total rompe la firma", tampered !== signed && !verify(tampered).ok);

const dir = mkdtempSync(join(tmpdir(), "firma-"));
writeFileSync(join(dir, "f.xml"), signed);
try {
  execFileSync("xmllint", ["--noout", "--schema", join(__dirname, "fixtures/sri-xsd/factura_V1.1.0.xsd"), join(dir, "f.xml")], { stdio: "pipe" });
  check("el XML firmado valida contra el XSD del SRI", true);
} catch (e) {
  check("el XML firmado valida contra el XSD del SRI", false, String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 500));
}
check("nuestro lector lo sigue leyendo", parseSriXml(signed).totalCents === 5000);

console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
process.exit(fallos ? 1 : 0);
