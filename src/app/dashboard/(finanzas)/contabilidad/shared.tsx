import { fmtMoney } from "@/lib/finance/entities";

export const money = (c: number) => (c === 0 ? "—" : fmtMoney(c, { decimals: true }));
export const day = (d: Date) => d.toISOString().slice(0, 10);

export const SOURCE_LABELS: Record<string, string> = {
  OPENING: "Apertura",
  MANUAL: "Manual",
  PAYMENT: "Cobro",
  INVOICE: "Factura",
  OTHER_INCOME: "Otro ingreso",
  EXPENSE: "Gasto",
  CAPITAL: "Dueños",
  BANK: "Banco",
  DEFERRED_REVENUE: "Diferidos",
  DEPRECIATION: "Depreciación",
  ACCRUAL: "Provisión",
  PAYROLL: "Nómina",
  CLOSING: "Cierre",
};

export function Indent({ depth, bold, children }: { depth: number; bold?: boolean; children: React.ReactNode }) {
  return (
    <span className={bold ? "font-semibold" : ""} style={{ paddingLeft: `${Math.max(0, depth) * 14}px` }}>
      {children}
    </span>
  );
}
