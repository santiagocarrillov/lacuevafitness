// Legal entities and labels for the Finanzas section. Client-safe (no server imports).
// Entity = sede (1:1 today). Design: docs/finanzas-fase1.md

import type {
  CapitalKind,
  ExpenseCategory,
  ExpenseDocType,
  ExpensePayMethod,
  OtherIncomeCategory,
  Sede,
} from "@/generated/prisma/enums";

export type LegalEntity = {
  sede: Sede;
  /** Short name used across the UI. */
  name: string;
  legalName: string;
  kind: "PERSONA_NATURAL" | "SAS";
  /** RUC — filled in once confirmed (regime analysis pending, oct 2026). */
  ruc: string | null;
  /** Buyer IDs that SRI invoices to this entity carry (RUC and/or cédula). */
  taxIds: string[];
  /** People who can contribute capital or lend money to this entity. */
  owners: string[];
  /** Issuer data printed on electronic invoices (Módulo 2). */
  tradeName: string;
  /** Dirección matriz as registered in the RUC — null until confirmed. */
  matrixAddress: string | null;
  /** "Obligado a llevar contabilidad" (printed in the XML). */
  accountingRequired: boolean;
};

export const ENTITIES: Record<Sede, LegalEntity> = {
  FITNESS_CENTER: {
    sede: "FITNESS_CENTER",
    name: "La Cueva Fitness",
    legalName: "Santiago Carrillo (persona natural)",
    kind: "PERSONA_NATURAL",
    ruc: "1707994461001",
    // Suppliers invoice Santiago with his cédula or his RUC (cédula + 001).
    taxIds: ["1707994461", "1707994461001"],
    owners: ["Santiago Carrillo", "Isabel Cárdenas"],
    tradeName: "La Cueva Fitness Center",
    matrixAddress: null,
    // Régimen general, NO obligado a llevar contabilidad (Santiago, 2 oct 2026).
    accountingRequired: false,
  },
  XTREME: {
    sede: "XTREME",
    name: "La Cueva Xtreme",
    // Certificado RUC (SRI, 28 ago 2026): régimen general, obligada a llevar
    // contabilidad, no es agente de retención.
    legalName: "La Cueva-Xtreme S.A.S.",
    kind: "SAS",
    ruc: "1793142958001",
    taxIds: ["1793142958001"],
    // Shareholders (EEFF 2025, nota 13): Santiago 55 %, María Belén Salazar Lozada 45 %.
    owners: ["Santiago Carrillo", "Isabel Cárdenas", "María Belén Salazar"],
    tradeName: "La Cueva Xtreme",
    matrixAddress: null,
    accountingRequired: true,
  },
};

export const ENTITY_ORDER: Sede[] = ["FITNESS_CENTER", "XTREME"];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  PAYROLL: "Sueldos y beneficios",
  RENT: "Arriendo",
  UTILITIES: "Servicios básicos",
  EQUIPMENT: "Equipamiento y mantenimiento",
  MARKETING: "Publicidad",
  SUPPLIES: "Insumos",
  SOFTWARE: "Software",
  TAXES: "Impuestos",
  PROFESSIONAL: "Servicios profesionales",
  BANK_FEES: "Comisiones bancarias y de tarjeta",
  INTEREST: "Intereses",
  OTHER: "Otros gastos",
};

export const DOC_TYPE_LABELS: Record<ExpenseDocType, string> = {
  FACTURA: "Factura",
  NOTA_VENTA: "Nota de venta",
  LIQUIDACION_COMPRA: "Liquidación de compra",
  RECIBO: "Recibo",
  SIN_DOCUMENTO: "Sin documento",
};

export const PAY_METHOD_LABELS: Record<ExpensePayMethod, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  BANK_DEBIT: "Débito bancario",
  DEBIT_CARD: "Tarjeta de débito",
  CREDIT_CARD: "Tarjeta de crédito",
  OTHER: "Otro",
};

export const CAPITAL_KIND_LABELS: Record<CapitalKind, string> = {
  CONTRIBUTION: "Aporte para futura capitalización",
  SHAREHOLDER_LOAN: "Préstamo del accionista",
  LOAN_REPAYMENT: "Devolución de préstamo",
  WITHDRAWAL: "Retiro del dueño",
};

/** +1 when money goes into the entity, −1 when it goes back to the owner. */
export const CAPITAL_SIGN: Record<CapitalKind, 1 | -1> = {
  CONTRIBUTION: 1,
  SHAREHOLDER_LOAN: 1,
  LOAN_REPAYMENT: -1,
  WITHDRAWAL: -1,
};

export const OTHER_INCOME_LABELS: Record<OtherIncomeCategory, string> = {
  PRODUCT_SALE: "Venta de productos",
  REIMBURSEMENT: "Reembolsos",
  OTHER: "Otros ingresos",
};

/** Deductible for income tax: backed by a sales document issued to the entity's RUC. */
export function isDeductible(e: { documentType: ExpenseDocType; supplierRuc: string | null }) {
  return (
    (e.documentType === "FACTURA" || e.documentType === "LIQUIDACION_COMPRA") && !!e.supplierRuc
  );
}

export function fmtMoney(cents: number, opts: { decimals?: boolean } = {}) {
  const v = cents / 100;
  const s = Math.abs(v).toLocaleString("es-EC", {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  });
  return `${v < 0 ? "−" : ""}$${s}`;
}

/** "YYYY-MM" → [start, end) as UTC-midnight dates. DATE columns and paidAt
 *  (stored as UTC midnight of the calendar day) both compare correctly. */
export function monthRangeUtc(ym: string): { start: Date; end: Date; year: number; month: number } {
  const [year, month] = ym.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
    year,
    month,
  };
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-EC", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Entity an SRI document belongs to, by the buyer ID printed on it. */
export function entityForBuyer(buyerId: string): Sede | null {
  const id = buyerId.trim();
  return ENTITY_ORDER.find((s) => ENTITIES[s].taxIds.includes(id)) ?? null;
}
