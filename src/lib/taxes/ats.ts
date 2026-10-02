// Anexo Transaccional Simplificado (ATS) — monthly XML for the DIMM (pure).
// Validated against the SRI at.xsd (scripts/fixtures/sri-xsd/ats.xsd).
// Rules applied for La Cueva Xtreme S.A.S.:
//  - It is NOT a withholding agent: every withholding field goes as 0.00 and
//    no AIR detail is reported.
//  - Electronic sales invoices are not reported in the ventas module (SRI);
//    all sales are electronic, so ventas and anulados are empty and the
//    establishment total is 0.00.
//  - Purchases: one detalleCompras per facturas / notas de venta /
//    liquidaciones with supplier RUC and number.

import type { PurchaseDoc } from "@/lib/taxes/iva";

export type AtsInput = {
  ruc: string;
  legalName: string;
  year: number;
  month: number;
  establishments: string[]; // ["001"]
  purchases: PurchaseDoc[];
  relatedParties?: string[]; // supplier RUCs that are related parties
};

const TIPO_COMPROBANTE: Record<string, string> = { FACTURA: "01", NOTA_VENTA: "02", LIQUIDACION_COMPRA: "03" };
const usd = (c: number) => (c / 100).toFixed(2);
const tag = (n: string, v: string) => `<${n}>${v}</${n}>`;
const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
/** razonSocial in the ATS: letters, digits and spaces only, upper case. */
export const atsName = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

/** SRI tabla 24 code for an expense payment method. */
function payForm(method: string | null) {
  if (method === "CASH") return "01";
  if (method === "CREDIT_CARD") return "19";
  if (method === "DEBIT_CARD") return "16";
  return "20";
}

/**
 * Sustento tributario (tabla 5): 01 crédito tributario de IVA (bienes y servicios),
 * 03 activo fijo con crédito tributario, 02 costo o gasto para renta (sin crédito).
 */
function sustento(d: PurchaseDoc) {
  if (d.documentType === "NOTA_VENTA" || d.ivaCents === 0) return "02";
  return d.assetCents > 0 && d.assetCents >= d.baseTaxedCents / 2 ? "03" : "01";
}

export function reportablePurchases(docs: PurchaseDoc[]) {
  return docs.filter((d) => TIPO_COMPROBANTE[d.documentType] && d.supplierRuc && /^\d{3}-\d{3}-\d{1,9}$/.test(d.documentNumber ?? ""));
}

export function buildAts(x: AtsInput): string {
  const rows = reportablePurchases(x.purchases).map((d) => {
    const [estab, pto, sec] = d.documentNumber!.split("-");
    const ruc = d.supplierRuc!;
    const tpId = ruc.length === 13 ? "01" : "02";
    // Physical documents carry a 10-digit printing authorization we don't keep.
    const auth = d.accessKey ?? "9999999999";
    const isNv = d.documentType === "NOTA_VENTA";
    return tag(
      "detalleCompras",
      tag("codSustento", sustento(d)) +
        tag("tpIdProv", tpId) +
        tag("idProv", ruc) +
        tag("tipoComprobante", TIPO_COMPROBANTE[d.documentType]) +
        tag("parteRel", x.relatedParties?.includes(ruc) ? "SI" : "NO") +
        tag("fechaRegistro", dmy(d.date)) +
        tag("establecimiento", estab) +
        tag("puntoEmision", pto) +
        tag("secuencial", sec.padStart(9, "0")) +
        tag("fechaEmision", dmy(d.date)) +
        tag("autorizacion", auth) +
        tag("baseNoGraIva", "0.00") +
        // A nota de venta's total (IVA included) goes as tarifa 0 base: no IVA credit.
        tag("baseImponible", usd(isNv ? d.totalCents : d.baseZeroCents)) +
        tag("baseImpGrav", usd(isNv ? 0 : d.baseTaxedCents)) +
        tag("baseImpExe", "0.00") +
        tag("montoIce", "0.00") +
        tag("montoIva", usd(isNv ? 0 : d.ivaCents)) +
        tag("valRetBien10", "0.00") +
        tag("valRetServ20", "0.00") +
        tag("valorRetBienes", "0.00") +
        tag("valRetServ50", "0.00") +
        tag("valorRetServicios", "0.00") +
        tag("valRetServ100", "0.00") +
        tag("totbasesImpReemb", "0.00") +
        tag("pagoExterior", tag("pagoLocExt", "01") + tag("paisEfecPago", "NA") + tag("aplicConvDobTrib", "NA") + tag("pagExtSujRetNorLeg", "NA")) +
        tag("formasDePago", tag("formaPago", payForm(d.paymentMethod))),
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    tag(
      "iva",
      tag("TipoIDInformante", "R") +
        tag("IdInformante", x.ruc) +
        tag("razonSocial", atsName(x.legalName)) +
        tag("Anio", String(x.year)) +
        tag("Mes", String(x.month).padStart(2, "0")) +
        tag("numEstabRuc", String(x.establishments.length).padStart(3, "0")) +
        tag("totalVentas", "0.00") +
        tag("codigoOperativo", "IVA") +
        (rows.length ? tag("compras", rows.join("")) : "") +
        tag("ventasEstablecimiento", x.establishments.map((e) => tag("ventaEst", tag("codEstab", e) + tag("ventasEstab", "0.00") + tag("ivaComp", "0.00"))).join("")),
    )
  );
}
