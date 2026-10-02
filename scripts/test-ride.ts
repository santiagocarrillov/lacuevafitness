/**
 * RIDE (PDF de la factura) — Módulo 2b.
 *  - el código de barras Code 128 de la clave de acceso lo decodifica ZXing
 *    (lector independiente) y devuelve exactamente los 49 dígitos
 *  - el PDF se genera con tildes/ñ y caracteres raros sin romperse
 *
 * Uso:  npx tsx scripts/test-ride.ts [salida.pdf]
 */
import { writeFileSync } from "fs";
import { BitArray, Code128Reader } from "@zxing/library";
import { CODE128, code128Digits, renderRide } from "../src/lib/invoicing/ride";
import { buildAccessKey } from "../src/lib/invoicing/xml";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

check("tabla Code 128: 106 símbolos de 11 módulos + stop de 13",
  CODE128.length === 107 && CODE128.slice(0, 106).every((p) => p.split("").reduce((a, b) => a + +b, 0) === 11) && CODE128[106].split("").reduce((a, b) => a + +b, 0) === 13);
check("tabla Code 128 sin símbolos repetidos", new Set(CODE128).size === 107);

function decode(digits: string) {
  const modules = code128Digits(digits).flatMap((v) => CODE128[v].split("").map(Number));
  const quiet = 10;
  const width = modules.reduce((a, b) => a + b, 0) + 2 * quiet;
  const row = new BitArray(width);
  let x = quiet;
  modules.forEach((w, k) => {
    if (k % 2 === 0) for (let i = 0; i < w; i++) row.set(x + i);
    x += w;
  });
  return new Code128Reader().decodeRow(0, row, new Map()).getText();
}
const key = buildAccessKey({ issueDate: new Date("2026-10-02T00:00:00Z"), ruc: "1793142958001", environment: "PRUEBAS", establishment: "001", point: "100", sequential: 1 });
check("ZXing decodifica la clave de acceso (49 dígitos, impar)", decode(key) === key, key);
check("ZXing decodifica un número par de dígitos", decode("12345678") === "12345678");

(async () => {
  const pdf = await renderRide({
    sede: "FITNESS_CENTER", environment: "PRUEBAS", establishment: "001", point: "100",
    establishmentAddress: "Av. Gral. Enríquez y calle Bomberos, Sangolquí", sequential: 1, accessKey: key,
    authorizationNumber: key, authorizedAt: new Date(), issueDate: new Date("2026-10-02T00:00:00Z"),
    buyerIdType: "05", buyerId: "1707994461", buyerName: "Santiago Carrillo — prueba “ñandú” 💪",
    buyerAddress: "Quito", buyerEmail: "socio@example.com", buyerPhone: "0999999999", payForm: "20",
    totalCents: 5375, ivaCents: 701,
    lines: [
      { code: "MEM", description: "Membresía mensual SRXFIT · octubre 2026 con una descripción larga para ver que se parte en varias líneas sin salirse de la columna", quantity: 1, unitPriceCents: 6000, discountCents: 1000, ivaRate: 15 },
      { code: "GAT", description: "Gatorade", quantity: 3, unitPriceCents: 125, discountCents: 0, ivaRate: 15 },
    ],
  });
  check("genera el PDF", pdf.length > 1000 && Buffer.from(pdf.slice(0, 5)).toString() === "%PDF-", `${pdf.length} bytes`);
  if (process.argv[2]) writeFileSync(process.argv[2], pdf);
  console.log(fallos ? `\n❌ ${fallos} fallo(s)` : "\n✅ Todo bien");
  process.exit(fallos ? 1 : 0);
})();
