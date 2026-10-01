// SRI electronic documents (pure — no DB). Parses the authorized XML that
// suppliers email or that SRI en Línea lets you download, and decodes access
// keys (claves de acceso). Verified against a real invoice (Security Data,
// jul 2026): <autorizacion> wrapper with the <factura> inside a CDATA block.
// Spec: SRI "Ficha técnica comprobantes electrónicos esquema offline".

import { XMLParser } from "fast-xml-parser";

export const DOC_CODES: Record<string, string> = {
  "01": "Factura",
  "03": "Liquidación de compra",
  "04": "Nota de crédito",
  "05": "Nota de débito",
  "06": "Guía de remisión",
  "07": "Comprobante de retención",
};

/** SRI "formaPago" codes (tabla 24). */
export const PAY_FORMS: Record<string, string> = {
  "01": "Sin utilización del sistema financiero",
  "15": "Compensación de deudas",
  "16": "Tarjeta de débito",
  "17": "Dinero electrónico",
  "18": "Tarjeta prepago",
  "19": "Tarjeta de crédito",
  "20": "Otros con utilización del sistema financiero",
  "21": "Endoso de títulos",
};

export type SriDocument = {
  accessKey: string;
  codDoc: string;
  issuerRuc: string;
  issuerName: string;
  /** 001-001-000000123 */
  docNumber: string;
  issueDate: Date; // UTC midnight of the issue day
  buyerId: string;
  buyerName: string;
  subtotalCents: number;
  ivaCents: number;
  totalCents: number;
  payForm: string | null;
  termDays: number;
  description: string;
};

// ── Access key ──────────────────────────────────────────────────────────────

/** Módulo 11 check digit over the first 48 digits (weights 2..7 from the right). */
export function accessKeyCheckDigit(first48: string): number {
  let sum = 0;
  let w = 2;
  for (let i = first48.length - 1; i >= 0; i--) {
    sum += Number(first48[i]) * w;
    w = w === 7 ? 2 : w + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? 0 : r === 10 ? 1 : r;
}

export function isValidAccessKey(key: string): boolean {
  return /^\d{49}$/.test(key) && accessKeyCheckDigit(key.slice(0, 48)) === Number(key[48]);
}

export type DecodedKey = {
  key: string;
  issueDate: Date;
  codDoc: string;
  issuerRuc: string;
  docNumber: string;
};

/** ddmmyyyy · codDoc(2) · RUC(13) · ambiente(1) · estab(3) ptoEmi(3) · secuencial(9) · código(8) · emisión(1) · DV(1) */
export function decodeAccessKey(key: string): DecodedKey | null {
  if (!isValidAccessKey(key)) return null;
  const d = +key.slice(0, 2), m = +key.slice(2, 4), y = +key.slice(4, 8);
  return {
    key,
    issueDate: new Date(Date.UTC(y, m - 1, d)),
    codDoc: key.slice(8, 10),
    issuerRuc: key.slice(10, 23),
    docNumber: `${key.slice(24, 27)}-${key.slice(27, 30)}-${key.slice(30, 39)}`,
  };
}

/** Every valid access key found anywhere in a text (e.g. the SRI "recibidos" TXT report). */
export function extractAccessKeys(text: string): string[] {
  const found = text.match(/(?<!\d)\d{49}(?!\d)/g) ?? [];
  return [...new Set(found.filter(isValidAccessKey))];
}

// ── XML ─────────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep "001", "05" and amounts as strings
  trimValues: true,
  isArray: (name) => ["totalImpuesto", "pago", "detalle", "impuesto", "campoAdicional"].includes(name),
});

const cents = (v: unknown) => {
  const n = Number(String(v ?? "0").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Valor inválido en el XML: "${v}"`);
  return Math.round(n * 100);
};

type Node = Record<string, unknown>;
const obj = (v: unknown): Node => (v && typeof v === "object" ? (v as Node) : {});
const arr = (v: unknown): Node[] => (Array.isArray(v) ? v.map(obj) : v ? [obj(v)] : []);
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

/** Accepts the <autorizacion> wrapper (CDATA or nested), the SOAP response, or a bare document. */
export function parseSriXml(xml: string): SriDocument {
  let doc = parser.parse(xml) as Node;

  // SOAP response → RespuestaAutorizacionComprobante → autorizaciones → autorizacion
  const soap = obj(obj(obj(doc["soap:Envelope"])["soap:Body"]));
  const soapAuth = Object.values(soap).map(obj).find((n) => n.RespuestaAutorizacionComprobante);
  if (soapAuth) {
    const auth = arr(obj(obj(soapAuth.RespuestaAutorizacionComprobante).autorizaciones).autorizacion)[0];
    doc = { autorizacion: auth };
  }
  const auth = obj(doc.autorizacion);
  if (doc.autorizacion) {
    if (s(auth.estado) && s(auth.estado) !== "AUTORIZADO") {
      throw new Error(`El comprobante no está autorizado (estado: ${s(auth.estado)}).`);
    }
    const inner = auth.comprobante;
    doc = typeof inner === "string" ? (parser.parse(inner) as Node) : obj(inner);
  }

  const rootName = ["factura", "liquidacionCompra", "notaCredito", "notaDebito", "comprobanteRetencion", "guiaRemision"].find((k) => doc[k]);
  if (!rootName) throw new Error("No es un comprobante electrónico del SRI.");
  const root = obj(doc[rootName]);
  const it = obj(root.infoTributaria);
  const codDoc = s(it.codDoc);
  if (codDoc !== "01" && codDoc !== "03") {
    throw new Error(`${DOC_CODES[codDoc] ?? `Documento ${codDoc}`}: por ahora solo se importan facturas y liquidaciones de compra.`);
  }
  const info = obj(root[codDoc === "01" ? "infoFactura" : "infoLiquidacionCompra"]);

  const accessKey = s(it.claveAcceso);
  if (!isValidAccessKey(accessKey)) throw new Error("La clave de acceso del XML no es válida.");

  const [dd, mm, yyyy] = s(info.fechaEmision).split("/").map(Number);
  if (!dd || !mm || !yyyy) throw new Error(`Fecha de emisión inválida: "${s(info.fechaEmision)}"`);

  // IVA = tax code 2 (all rates). ICE (3) and others stay inside the subtotal.
  const taxes = arr(obj(info.totalConImpuestos).totalImpuesto);
  const ivaCents = taxes.filter((t) => s(t.codigo) === "2").reduce((a, t) => a + cents(t.valor), 0);
  const totalCents = cents(info.importeTotal);
  const pago = arr(obj(info.pagos).pago)[0];
  const details = arr(obj(root.detalles).detalle).map((d) => s(d.descripcion)).filter(Boolean);

  // For a liquidación de compra the buyer is us and the "proveedor" is the seller.
  const isLiq = codDoc === "03";
  return {
    accessKey,
    codDoc,
    issuerRuc: isLiq ? s(info.identificacionProveedor) : s(it.ruc),
    issuerName: isLiq ? s(info.razonSocialProveedor) : s(it.nombreComercial) || s(it.razonSocial),
    docNumber: `${s(it.estab)}-${s(it.ptoEmi)}-${s(it.secuencial)}`,
    issueDate: new Date(Date.UTC(yyyy, mm - 1, dd)),
    buyerId: isLiq ? s(it.ruc) : s(info.identificacionComprador),
    buyerName: isLiq ? s(it.razonSocial) : s(info.razonSocialComprador),
    subtotalCents: totalCents - ivaCents,
    ivaCents,
    totalCents,
    payForm: pago ? s(pago.formaPago) || null : null,
    termDays: pago ? Number(s(pago.plazo)) || 0 : 0,
    description: details.slice(0, 3).join(" · ").slice(0, 200) || (DOC_CODES[codDoc] ?? "Comprobante"),
  };
}
