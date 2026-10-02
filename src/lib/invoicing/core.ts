// Invoice math and SRI rules (pure, client-safe). Prices include IVA; the
// split uses the same rounding as the journal (splitIva), so the invoice and
// the books always agree. |IVA − base × 15 %| < 0.6 cents on every line, inside
// the SRI's 1-cent tolerance. Design: docs/facturacion-sri.md

import type { PaymentMethod, TaxIdType } from "@/generated/prisma/enums";

/** Consumidor final: identification 9999999999999, total ≤ $50 with IVA
 *  (régimen general). Since 1 Jan 2026 these cannot be voided or credited. */
export const CONSUMER_FINAL_ID = "9999999999999";
export const CONSUMER_FINAL_NAME = "CONSUMIDOR FINAL";
export const CONSUMER_FINAL_MAX_CENTS = 5000;

/** SRI tabla 6: tipo de identificación del comprador. */
export const BUYER_ID_CODES: Record<TaxIdType | "CONSUMIDOR_FINAL", string> = {
  RUC: "04",
  CEDULA: "05",
  PASAPORTE: "06",
  CONSUMIDOR_FINAL: "07",
};

export const TAX_ID_LABELS: Record<TaxIdType, string> = {
  CEDULA: "Cédula",
  RUC: "RUC",
  PASAPORTE: "Pasaporte",
};

/** SRI tabla 16/17: código de porcentaje de IVA. */
export const IVA_PERCENT_CODES: Record<number, string> = { 0: "0", 5: "5", 12: "2", 13: "10", 14: "3", 15: "4" };

/** SRI tabla 24 (formaPago) for each way La Cueva collects. */
export const PAY_FORM_LABELS: Record<string, string> = {
  "01": "Efectivo (sin sistema financiero)",
  "16": "Tarjeta de débito",
  "19": "Tarjeta de crédito",
  "20": "Transferencia / otros con sistema financiero",
};

export function defaultPayForm(method: PaymentMethod): string {
  if (method === "CASH") return "01";
  if (method === "STRIPE_CARD" || method === "PLUX_CARD") return "19";
  return "20";
}

export const INCOME_ACCOUNTS: { code: string; label: string }[] = [
  { code: "4.1.01", label: "Mensualidades" },
  { code: "4.1.02", label: "Evaluaciones y pases diarios" },
  { code: "4.1.03", label: "Bebidas y suplementos" },
  { code: "4.2.01", label: "Otros ingresos" },
];

// ── Amounts ─────────────────────────────────────────────────────────────────

/** Splits a VAT-inclusive total. $50 → net 43.48 + IVA 6.52. Same as posting.ts. */
export function splitGross(totalCents: number, rate: number) {
  const iva = Math.round((totalCents * rate) / (100 + rate));
  return { net: totalCents - iva, iva };
}

export type LineInput = {
  quantity: number;
  unitPriceCents: number; // with IVA
  discountCents?: number; // with IVA
  ivaRate: number;
};

export type LineAmounts = {
  totalCents: number; // with IVA, after discount
  subtotalCents: number; // base imponible
  ivaCents: number;
  /** For the XML: unit price and discount WITHOUT IVA. */
  netGrossCents: number; // quantity × unit, without IVA, before discount
  netDiscountCents: number;
  netUnitPrice: string; // 6 decimals, dollars
};

export function lineAmounts(l: LineInput): LineAmounts {
  if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("La cantidad debe ser un entero mayor que 0.");
  if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) throw new Error("Precio inválido.");
  const discount = l.discountCents ?? 0;
  const gross = l.quantity * l.unitPriceCents;
  if (discount < 0 || discount > gross) throw new Error("El descuento no puede superar el valor de la línea.");
  const total = gross - discount;
  const { net, iva } = splitGross(total, l.ivaRate);
  const netGross = splitGross(gross, l.ivaRate).net;
  return {
    totalCents: total,
    subtotalCents: net,
    ivaCents: iva,
    netGrossCents: netGross,
    netDiscountCents: netGross - net,
    netUnitPrice: (netGross / l.quantity / 100).toFixed(6),
  };
}

export type InvoiceTotals = {
  subtotalCents: number;
  discountCents: number; // without IVA
  ivaCents: number;
  totalCents: number;
  /** Per IVA rate, for <totalConImpuestos>. */
  byRate: { rate: number; baseCents: number; ivaCents: number }[];
};

export function invoiceTotals(lines: LineInput[]): InvoiceTotals {
  const byRate = new Map<number, { rate: number; baseCents: number; ivaCents: number }>();
  let subtotal = 0, discount = 0, iva = 0, total = 0;
  for (const l of lines) {
    const a = lineAmounts(l);
    subtotal += a.subtotalCents;
    discount += a.netDiscountCents;
    iva += a.ivaCents;
    total += a.totalCents;
    const r = byRate.get(l.ivaRate) ?? { rate: l.ivaRate, baseCents: 0, ivaCents: 0 };
    r.baseCents += a.subtotalCents;
    r.ivaCents += a.ivaCents;
    byRate.set(l.ivaRate, r);
  }
  return { subtotalCents: subtotal, discountCents: discount, ivaCents: iva, totalCents: total, byRate: [...byRate.values()] };
}

// ── Identification ──────────────────────────────────────────────────────────

/** Ecuadorian cédula: province 01–24 (or 30 for abroad), 3rd digit < 6, módulo 10. */
export function isValidCedula(id: string): boolean {
  if (!/^\d{10}$/.test(id)) return false;
  const prov = Number(id.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false;
  if (Number(id[2]) >= 6) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(id[i]) * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === Number(id[9]);
}

/** RUC: 13 digits ending in 001 (or another establishment). A persona natural's
 *  RUC is their cédula + 001. Companies' check digits are not validated: the SRI
 *  stopped guaranteeing módulo 11 on new RUCs. */
export function isValidRuc(id: string): boolean {
  if (!/^\d{13}$/.test(id) || id.endsWith("000")) return false;
  const prov = Number(id.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false;
  const third = Number(id[2]);
  if (third < 6) return isValidCedula(id.slice(0, 10));
  return third === 6 || third === 9;
}

/** Error message for an identification, or null when it is fine. */
export function taxIdError(type: TaxIdType, id: string): string | null {
  const v = id.trim();
  if (!v) return "Falta el número de identificación.";
  if (type === "CEDULA" && !isValidCedula(v)) return "La cédula no es válida (10 dígitos, dígito verificador).";
  if (type === "RUC" && !isValidRuc(v)) return "El RUC no es válido (13 dígitos, termina en 001).";
  if (type === "PASAPORTE" && !/^[A-Za-z0-9]{5,20}$/.test(v)) return "El pasaporte debe tener entre 5 y 20 letras o números.";
  return null;
}

/** Guess the type from the digits typed (10 → cédula, 13 → RUC). */
export function guessTaxIdType(id: string): TaxIdType {
  const v = id.trim();
  if (/^\d{13}$/.test(v)) return "RUC";
  if (/^\d{10}$/.test(v)) return "CEDULA";
  return "PASAPORTE";
}

export function formatDocNumber(establishment: string, point: string, sequential: number) {
  return `${establishment}-${point}-${String(sequential).padStart(9, "0")}`;
}

export function fmtUsd(cents: number) {
  return (cents / 100).toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
