// Builds the unsigned SRI "factura" XML (esquema offline, version 1.1.0, which
// allows 6-decimal unit prices) and its 49-digit access key. Pure — signing
// (XAdES-BES) and the SRI web services come in 2b.
// Spec: SRI "Ficha técnica comprobantes electrónicos esquema offline" (v2.34).

import { randomInt } from "crypto";
import { accessKeyCheckDigit } from "@/lib/finance/sri-xml";
import { ENTITIES } from "@/lib/finance/entities";
import type { Sede, SriEnvironment } from "@/generated/prisma/enums";
import { IVA_PERCENT_CODES, invoiceTotals, lineAmounts, type LineInput } from "@/lib/invoicing/core";

export const ENV_CODE: Record<SriEnvironment, "1" | "2"> = { PRUEBAS: "1", PRODUCCION: "2" };

const ddmmyyyy = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCMonth() + 1).padStart(2, "0")}${d.getUTCFullYear()}`;

/** ddmmyyyy · 01 · RUC · ambiente · estab ptoEmi · secuencial(9) · código(8) · 1 · DV */
export function buildAccessKey(p: {
  issueDate: Date; // UTC midnight of the issue day
  ruc: string;
  environment: SriEnvironment;
  establishment: string;
  point: string;
  sequential: number;
  numericCode?: string; // 8 digits; random when omitted
  codDoc?: string;
}): string {
  const code = p.numericCode ?? String(randomInt(0, 100_000_000)).padStart(8, "0");
  const first48 =
    ddmmyyyy(p.issueDate) +
    (p.codDoc ?? "01") +
    p.ruc +
    ENV_CODE[p.environment] +
    p.establishment +
    p.point +
    String(p.sequential).padStart(9, "0") +
    code +
    "1";
  if (!/^\d{48}$/.test(first48)) throw new Error("No se pudo armar la clave de acceso: revisa RUC, establecimiento y punto de emisión.");
  return first48 + accessKeyCheckDigit(first48);
}

export type InvoiceXmlInput = {
  sede: Sede;
  environment: SriEnvironment;
  establishment: string;
  point: string;
  establishmentAddress: string;
  sequential: number;
  accessKey: string;
  issueDate: Date;
  buyerIdType: string; // SRI code
  buyerId: string;
  buyerName: string;
  buyerAddress?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  payForm: string;
  lines: (LineInput & { code: string; description: string })[];
};

// Text escaped exactly as Canonical XML renders it (& < > only), so the string
// we build IS the canonical form the signature digests (see xades.ts).
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** SRI text fields: no line breaks, collapsed spaces, max length. */
const txt = (v: string, max = 300) => esc(v.replace(/\s+/g, " ").trim().slice(0, max));
const usd = (cents: number) => (cents / 100).toFixed(2);
const tag = (name: string, value: string) => `<${name}>${value}</${name}>`;

export function buildInvoiceXml(x: InvoiceXmlInput): string {
  const entity = ENTITIES[x.sede];
  if (!entity.ruc) throw new Error(`Falta el RUC de ${entity.name}.`);
  if (!x.lines.length) throw new Error("La factura no tiene líneas.");
  const totals = invoiceTotals(x.lines);
  const d = x.issueDate;
  const fecha = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const ivaCode = (rate: number) => {
    const c = IVA_PERCENT_CODES[rate];
    if (c === undefined) throw new Error(`Tarifa de IVA no soportada: ${rate} %`);
    return c;
  };

  const infoTributaria = [
    tag("ambiente", ENV_CODE[x.environment]),
    tag("tipoEmision", "1"),
    tag("razonSocial", txt(entity.legalName)),
    tag("nombreComercial", txt(entity.tradeName)),
    tag("ruc", entity.ruc),
    tag("claveAcceso", x.accessKey),
    tag("codDoc", "01"),
    tag("estab", x.establishment),
    tag("ptoEmi", x.point),
    tag("secuencial", String(x.sequential).padStart(9, "0")),
    tag("dirMatriz", txt(entity.matrixAddress ?? x.establishmentAddress)),
  ].join("");

  const totalConImpuestos = totals.byRate
    .map((r) =>
      tag(
        "totalImpuesto",
        tag("codigo", "2") + tag("codigoPorcentaje", ivaCode(r.rate)) + tag("baseImponible", usd(r.baseCents)) + tag("tarifa", String(r.rate)) + tag("valor", usd(r.ivaCents)),
      ),
    )
    .join("");

  const infoFactura = [
    tag("fechaEmision", fecha),
    tag("dirEstablecimiento", txt(x.establishmentAddress)),
    tag("obligadoContabilidad", entity.accountingRequired ? "SI" : "NO"),
    tag("tipoIdentificacionComprador", x.buyerIdType),
    tag("razonSocialComprador", txt(x.buyerName)),
    tag("identificacionComprador", esc(x.buyerId.trim())),
    ...(x.buyerAddress?.trim() ? [tag("direccionComprador", txt(x.buyerAddress))] : []),
    tag("totalSinImpuestos", usd(totals.subtotalCents)),
    tag("totalDescuento", usd(totals.discountCents)),
    tag("totalConImpuestos", totalConImpuestos),
    tag("propina", "0.00"),
    tag("importeTotal", usd(totals.totalCents)),
    tag("moneda", "DOLAR"),
    tag("pagos", tag("pago", tag("formaPago", x.payForm) + tag("total", usd(totals.totalCents)))),
  ].join("");

  const detalles = x.lines
    .map((l) => {
      const a = lineAmounts(l);
      return tag(
        "detalle",
        tag("codigoPrincipal", txt(l.code, 25)) +
          tag("descripcion", txt(l.description)) +
          tag("cantidad", l.quantity.toFixed(6)) +
          tag("precioUnitario", a.netUnitPrice) +
          tag("descuento", usd(a.netDiscountCents)) +
          tag("precioTotalSinImpuesto", usd(a.subtotalCents)) +
          tag(
            "impuestos",
            tag(
              "impuesto",
              tag("codigo", "2") + tag("codigoPorcentaje", ivaCode(l.ivaRate)) + tag("tarifa", String(l.ivaRate)) + tag("baseImponible", usd(a.subtotalCents)) + tag("valor", usd(a.ivaCents)),
            ),
          ),
      );
    })
    .join("");

  const extra = [
    x.buyerEmail?.trim() ? `<campoAdicional nombre="Email">${txt(x.buyerEmail)}</campoAdicional>` : "",
    x.buyerPhone?.trim() ? `<campoAdicional nombre="Teléfono">${txt(x.buyerPhone)}</campoAdicional>` : "",
  ].join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<factura id="comprobante" version="1.1.0">` +
    tag("infoTributaria", infoTributaria) +
    tag("infoFactura", infoFactura) +
    tag("detalles", detalles) +
    (extra ? tag("infoAdicional", extra) : "") +
    `</factura>`
  );
}
