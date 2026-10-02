// Chart of accounts per legal entity (no auth — callers check permissions).
// Structure follows the NIIF PYMES statement lines used in the signed 2025
// statements of La Cueva-Xtreme S.A.S.; codes are hierarchical by prefix
// ("1.1.02.01" is a child of "1.1.02"). Idempotent seed by (sede, code).

import { prisma } from "@/lib/prisma";
import type {
  ExpenseCategory,
  LedgerAccountType,
  LedgerRole,
  Prisma,
  Sede,
} from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export type ChartRow = {
  code: string;
  name: string;
  type: LedgerAccountType;
  role?: LedgerRole;
  group?: boolean; // non-postable header
  expenseCategory?: ExpenseCategory;
  /** Link to a BankAccount: matched by statement format + last4 (or sede only for Pacífico). */
  bank?: { format: "PACIFICO" | "PICHINCHA" | "PRODUBANCO"; last4?: string };
};

const COMMON_TOP: ChartRow[] = [
  { code: "1", name: "Activo", type: "ASSET", group: true },
  { code: "1.1", name: "Activo corriente", type: "ASSET", group: true },
  { code: "1.1.01", name: "Caja", type: "ASSET", role: "CASH_ON_HAND" },
  { code: "1.1.02", name: "Bancos", type: "ASSET", group: true },
  { code: "1.1.03", name: "Inventario de bebidas y suplementos", type: "ASSET", role: "INVENTORY" },
  { code: "1.1.04", name: "Arriendo pagado por anticipado", type: "ASSET", role: "PREPAID" },
  // Bridge for everything not yet matched to a bank line (transfers and card
  // collections reported by reception, owner deposits, payments made by
  // transfer). Bank reconciliation moves each item to the real bank account.
  { code: "1.1.05", name: "Cuenta puente: movimientos por conciliar con bancos", type: "ASSET" },
  { code: "1.1.06", name: "Cuentas por cobrar", type: "ASSET" },
  { code: "1.2", name: "Propiedades, planta y equipo", type: "ASSET", group: true },
  { code: "1.2.01", name: "Instalaciones y adecuaciones", type: "ASSET", role: "FIXED_ASSET" },
  { code: "1.2.02", name: "Equipo de oficina", type: "ASSET", role: "FIXED_ASSET" },
  { code: "1.2.03", name: "Equipos y maquinaria", type: "ASSET", role: "FIXED_ASSET" },
  { code: "1.2.09", name: "(−) Depreciación acumulada", type: "ASSET", role: "ACCUMULATED_DEPRECIATION" },
  { code: "1.3", name: "Activos por impuestos corrientes", type: "ASSET", group: true },
  { code: "1.3.01", name: "Crédito tributario de IVA", type: "ASSET", role: "TAX_CREDIT" },

  { code: "2", name: "Pasivo", type: "LIABILITY", group: true },
  { code: "2.1", name: "Pasivo corriente", type: "LIABILITY", group: true },
  { code: "2.1.01", name: "Cuentas por pagar proveedores", type: "LIABILITY", role: "PAYABLES" },
  { code: "2.1.02", name: "Intereses por pagar", type: "LIABILITY", role: "INTEREST_PAYABLE" },
  { code: "2.1.03", name: "IESS aporte patronal por pagar", type: "LIABILITY", role: "PAYROLL_LIABILITIES" },
  { code: "2.1.04", name: "IESS aporte personal por pagar", type: "LIABILITY", role: "PAYROLL_LIABILITIES" },
  { code: "2.1.05", name: "Fondos de reserva por pagar", type: "LIABILITY", role: "PAYROLL_LIABILITIES" },
  { code: "2.1.06", name: "IVA por pagar (ventas)", type: "LIABILITY" },
  { code: "2.1.07", name: "Ingresos diferidos (membresías prepagadas)", type: "LIABILITY" },
  { code: "2.1.08", name: "Sueldos y beneficios por pagar", type: "LIABILITY", role: "PAYROLL_LIABILITIES" },
  { code: "2.1.09", name: "Tarjetas de crédito por pagar", type: "LIABILITY" },

  { code: "4", name: "Ingresos", type: "INCOME", group: true },
  { code: "4.1", name: "Ingresos de actividades ordinarias", type: "INCOME", group: true },
  { code: "4.1.01", name: "Mensualidades", type: "INCOME" },
  { code: "4.1.02", name: "Evaluaciones y pases diarios", type: "INCOME" },
  { code: "4.1.03", name: "Venta de bebidas y suplementos", type: "INCOME" },
  { code: "4.2", name: "Otros ingresos", type: "INCOME", group: true },
  { code: "4.2.01", name: "Otros ingresos", type: "INCOME" },
  { code: "4.2.02", name: "Reembolsos", type: "INCOME" },

  { code: "5", name: "Costos y gastos", type: "EXPENSE", group: true },
  { code: "5.1", name: "Costo de ventas", type: "EXPENSE", group: true },
  { code: "5.1.01", name: "Costo de bebidas y suplementos", type: "EXPENSE" },
  { code: "5.2", name: "Gastos de personal", type: "EXPENSE", group: true },
  { code: "5.2.01", name: "Sueldos, beneficios y aportes", type: "EXPENSE", expenseCategory: "PAYROLL" },
  { code: "5.2.02", name: "Honorarios de coaches", type: "EXPENSE", expenseCategory: "COACH_FEES" },
  { code: "5.3", name: "Gastos de administración y ventas", type: "EXPENSE", group: true },
  { code: "5.3.01", name: "Arriendo", type: "EXPENSE", expenseCategory: "RENT" },
  { code: "5.3.02", name: "Servicios básicos", type: "EXPENSE", expenseCategory: "UTILITIES" },
  { code: "5.3.03", name: "Mantenimiento y equipamiento", type: "EXPENSE", expenseCategory: "EQUIPMENT" },
  { code: "5.3.04", name: "Publicidad", type: "EXPENSE", expenseCategory: "MARKETING" },
  { code: "5.3.05", name: "Insumos y suministros", type: "EXPENSE", expenseCategory: "SUPPLIES" },
  { code: "5.3.06", name: "Software", type: "EXPENSE", expenseCategory: "SOFTWARE" },
  { code: "5.3.07", name: "Impuestos y contribuciones", type: "EXPENSE", expenseCategory: "TAXES" },
  { code: "5.3.08", name: "Servicios profesionales", type: "EXPENSE", expenseCategory: "PROFESSIONAL" },
  { code: "5.3.09", name: "Comisiones bancarias y de tarjeta", type: "EXPENSE", expenseCategory: "BANK_FEES" },
  { code: "5.3.10", name: "Depreciación", type: "EXPENSE" },
  { code: "5.3.99", name: "Otros gastos", type: "EXPENSE", expenseCategory: "OTHER" },
  { code: "5.4", name: "Gastos financieros", type: "EXPENSE", group: true },
  { code: "5.4.01", name: "Intereses", type: "EXPENSE", expenseCategory: "INTEREST" },
];

const CHARTS: Record<Sede, ChartRow[]> = {
  XTREME: [
    ...COMMON_TOP,
    { code: "1.1.02.01", name: "Banco del Pacífico", type: "ASSET", role: "BANK", bank: { format: "PACIFICO" } },
    { code: "2.2", name: "Pasivo no corriente", type: "LIABILITY", group: true },
    { code: "2.2.01", name: "Préstamos de accionistas", type: "LIABILITY", role: "SHAREHOLDER_LOANS" },
    { code: "2.2.02", name: "Préstamo a mutuo", type: "LIABILITY", role: "RELATED_LOANS" },
    { code: "3", name: "Patrimonio", type: "EQUITY", group: true },
    { code: "3.1", name: "Capital", type: "EQUITY", group: true },
    { code: "3.1.01", name: "Capital suscrito", type: "EQUITY", role: "CAPITAL" },
    { code: "3.1.02", name: "Aportes para futura capitalización", type: "EQUITY" },
    { code: "3.2", name: "Resultados", type: "EQUITY", group: true },
    { code: "3.2.01", name: "(−) Pérdidas acumuladas de ejercicios anteriores", type: "EQUITY", role: "RETAINED_EARNINGS" },
    { code: "3.2.02", name: "(−) Pérdida del ejercicio 2025", type: "EQUITY", role: "RETAINED_EARNINGS" },
  ],
  FITNESS_CENTER: [
    ...COMMON_TOP,
    { code: "1.1.02.01", name: "Banco Pichincha ··3483", type: "ASSET", role: "BANK", bank: { format: "PICHINCHA", last4: "3483" } },
    { code: "1.1.02.02", name: "Banco Pichincha ··2500 (cuenta mixta)", type: "ASSET", role: "BANK", bank: { format: "PICHINCHA", last4: "2500" } },
    { code: "1.1.02.03", name: "Produbanco ··1001 (cuenta mixta)", type: "ASSET", role: "BANK", bank: { format: "PRODUBANCO", last4: "1001" } },
    { code: "3", name: "Patrimonio", type: "EQUITY", group: true },
    { code: "3.1", name: "Capital del propietario", type: "EQUITY", group: true },
    { code: "3.1.01", name: "Capital del propietario", type: "EQUITY", role: "CAPITAL" },
    { code: "3.1.02", name: "Aportes y retiros del propietario", type: "EQUITY" },
    { code: "3.2", name: "Resultados", type: "EQUITY", group: true },
    { code: "3.2.01", name: "Resultados acumulados", type: "EQUITY", role: "RETAINED_EARNINGS" },
  ],
};

export function chartFor(sede: Sede): ChartRow[] {
  return [...CHARTS[sede]].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

/** Parent code = longest proper prefix ("1.1.02.01" → "1.1.02"). */
export function parentCode(code: string): string | null {
  const i = code.lastIndexOf(".");
  return i < 0 ? null : code.slice(0, i);
}

/**
 * Creates/updates the chart for an entity. Existing accounts keep their id
 * (and opening balances). One-time recode: Xtreme's "1.1.02 Banco del
 * Pacífico" (detail, from the 2025 seed) becomes "1.1.02.01" under the new
 * "1.1.02 Bancos" group.
 */
export async function seedChart(db: Db, sede: Sede): Promise<{ created: number; updated: number }> {
  const legacyBank = await db.ledgerAccount.findUnique({ where: { sede_code: { sede, code: "1.1.02" } } });
  if (legacyBank && legacyBank.role === "BANK" && legacyBank.postable) {
    const taken = await db.ledgerAccount.findUnique({ where: { sede_code: { sede, code: "1.1.02.01" } } });
    if (!taken) await db.ledgerAccount.update({ where: { id: legacyBank.id }, data: { code: "1.1.02.01" } });
  }

  const banks = await db.bankAccount.findMany({ where: { sede, active: true } });
  let created = 0;
  let updated = 0;
  for (const row of chartFor(sede)) {
    const bank = row.bank
      ? banks.find((b) => b.statementFormat === row.bank!.format && (!row.bank!.last4 || b.last4 === row.bank!.last4))
      : undefined;
    const data = {
      name: row.name,
      type: row.type,
      role: row.role ?? "OTHER",
      postable: !row.group,
      expenseCategory: row.expenseCategory ?? null,
      ...(row.bank ? { bankAccountId: bank?.id ?? null } : {}),
    } as const;
    const existing = await db.ledgerAccount.findUnique({ where: { sede_code: { sede, code: row.code } } });
    if (existing) {
      await db.ledgerAccount.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await db.ledgerAccount.create({ data: { sede, code: row.code, ...data } });
      created++;
    }
  }

  // Wire parents by code prefix (for every account of the entity, incl. ones added by hand).
  const all = await db.ledgerAccount.findMany({ where: { sede } });
  const byCode = new Map(all.map((a) => [a.code, a.id]));
  for (const a of all) {
    let p = parentCode(a.code);
    while (p && !byCode.has(p)) p = parentCode(p);
    const parentId = p ? byCode.get(p)! : null;
    if (a.parentId !== parentId) await db.ledgerAccount.update({ where: { id: a.id }, data: { parentId } });
  }
  return { created, updated };
}
