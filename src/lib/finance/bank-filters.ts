// Filters of Caja y Bancos › Movimientos, read from the URL (pure — client-safe).

import type { BankTxnKind, Sede } from "@/generated/prisma/enums";
import { parseRange } from "@/lib/date-range";

export const TXN_KIND_LABELS: Record<BankTxnKind, string> = {
  MEMBER_PAYMENT: "Cobro de socios",
  CARD_SETTLEMENT: "Liquidación de tarjeta",
  OTHER_INCOME: "Otro ingreso",
  EXPENSE: "Gasto",
  CAPITAL: "Dueños y accionistas",
  INTERNAL_TRANSFER: "Entre cuentas propias",
  LOAN_PAYMENT: "Cuota de préstamo",
  PAYROLL: "Sueldos e IESS",
  TAXES: "Pago al SRI",
  PERSONAL: "Personal",
};

const KINDS = Object.keys(TXN_KIND_LABELS) as BankTxnKind[];

export type TxnEstado = "pendiente" | "clasificado" | "ignorado";

export type TxnFilters = {
  cuenta: string | null;
  sede: Sede | null;
  estado: TxnEstado | null;
  tipo: BankTxnKind | null;
  dir: "entradas" | "salidas" | null;
  desde: string;
  hasta: string;
  rango: string | null;
  q: string;
  page: number;
};

export function parseTxnFilters(sp: Record<string, string | undefined>): TxnFilters {
  const { desde, hasta, rango } = parseRange(sp, "90d");
  return {
    cuenta: sp.cuenta && /^[a-z0-9]{10,40}$/.test(sp.cuenta) ? sp.cuenta : null,
    sede: sp.entidad === "FITNESS_CENTER" || sp.entidad === "XTREME" ? sp.entidad : null,
    estado: sp.estado === "pendiente" || sp.estado === "clasificado" || sp.estado === "ignorado" ? sp.estado : null,
    tipo: KINDS.includes(sp.tipo as BankTxnKind) ? (sp.tipo as BankTxnKind) : null,
    dir: sp.dir === "entradas" || sp.dir === "salidas" ? sp.dir : null,
    desde,
    hasta,
    rango,
    q: (sp.q ?? "").trim().slice(0, 80),
    page: Math.max(1, parseInt(sp.page ?? "1", 10) || 1),
  };
}
