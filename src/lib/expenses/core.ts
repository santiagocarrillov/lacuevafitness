// Expenses with lines (Módulo 3, pure, client-safe). Each line goes to an
// expense or asset account. Personnel costs (5.2.x: sueldos, honorarios de
// coaches) are private: admins never see or record them.

import type { ExpenseCategory, ExpenseDocType } from "@/generated/prisma/enums";

export const PRIVATE_PREFIX = "5.2.";
export const PRIVATE_CATEGORIES: ExpenseCategory[] = ["PAYROLL", "COACH_FEES"];

export const isPrivateCode = (code: string) => code.startsWith(PRIVATE_PREFIX);

/** Asset accounts a purchase can go to (prepaid rent, fixed assets). */
export const ASSET_LINE_CODES = ["1.1.04", "1.2.01", "1.2.02", "1.2.03"];
/** Expense accounts that are never bought directly. */
const NOT_PURCHASABLE = ["5.3.10"]; // depreciación (asiento de ajuste)

export type AccountOpt = { id: string; code: string; name: string; type: string; postable: boolean; expenseCategory: ExpenseCategory | null };

export function lineAccounts<T extends AccountOpt>(accounts: T[], opts: { includePrivate: boolean }): T[] {
  return accounts
    .filter((a) => a.postable)
    .filter((a) => (a.type === "EXPENSE" && !NOT_PURCHASABLE.includes(a.code)) || ASSET_LINE_CODES.includes(a.code))
    .filter((a) => opts.includePrivate || !isPrivateCode(a.code))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

/** Only facturas and liquidaciones de compra give IVA credit; on the rest the
 *  IVA is part of the cost. */
export const hasIvaCredit = (doc: ExpenseDocType) => doc === "FACTURA" || doc === "LIQUIDACION_COMPRA";

export type ExpenseLineInput = { description: string; accountCode: string; subtotalCents: number; ivaRate: number; ivaCents: number };

export function expenseTotals(lines: ExpenseLineInput[]) {
  const subtotal = lines.reduce((a, l) => a + l.subtotalCents, 0);
  const iva = lines.reduce((a, l) => a + l.ivaCents, 0);
  return { subtotalCents: subtotal, ivaCents: iva, totalCents: subtotal + iva };
}

/** IVA of a line from its base. Receipts may differ by a cent: the user can edit it. */
export const ivaFor = (subtotalCents: number, rate: number) => Math.round((subtotalCents * rate) / 100);

/** Header category: the one of the line with the largest amount (assets → equipment). */
export function headerCategory(lines: { subtotalCents: number; category: ExpenseCategory | null; isAsset: boolean }[]): ExpenseCategory {
  const top = [...lines].sort((a, b) => b.subtotalCents - a.subtotalCents)[0];
  if (!top) return "OTHER";
  return top.category ?? (top.isAsset ? "EQUIPMENT" : "OTHER");
}
