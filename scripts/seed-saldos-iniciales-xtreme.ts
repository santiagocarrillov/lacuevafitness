/**
 * Plan de cuentas y saldos iniciales 2026 de La Cueva-Xtreme S.A.S., tomados de
 * los EEFF 2025 FIRMADOS (estado de situación al 31-dic-2025 + notas 4–14).
 * Idempotente: crea o actualiza por (sede, código). Sin --write solo muestra.
 *
 * Uso:  npx tsx scripts/seed-saldos-iniciales-xtreme.ts [--write]
 */

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { LedgerAccountType, LedgerRole } from "../src/generated/prisma/enums";

const AS_OF = new Date("2025-12-31T00:00:00.000Z");
const SOURCE = "EEFF 2025 firmados (Supercías)";

// [code, name, type, role, amount in USD on the natural side, note]
const ROWS: [string, string, LedgerAccountType, LedgerRole, number, string][] = [
  ["1.1.01", "Caja", "ASSET", "CASH_ON_HAND", 142.97, "Nota 4"],
  ["1.1.02.01", "Banco del Pacífico", "ASSET", "BANK", 11.52, "Nota 4"],
  ["1.1.03", "Inventario de bebidas y suplementos", "ASSET", "INVENTORY", 555.21, "Nota 5"],
  ["1.1.04", "Arriendo pagado por anticipado", "ASSET", "PREPAID", 920.0, "Nota 6"],
  ["1.2.01", "Instalaciones y adecuaciones", "ASSET", "FIXED_ASSET", 21208.77, "Nota 7"],
  ["1.2.02", "Equipo de oficina", "ASSET", "FIXED_ASSET", 259.95, "Nota 7"],
  ["1.2.03", "Equipos y maquinaria", "ASSET", "FIXED_ASSET", 3262.42, "Nota 7"],
  ["1.2.09", "(−) Depreciación acumulada", "ASSET", "ACCUMULATED_DEPRECIATION", -6459.16, "Nota 7"],
  ["1.3.01", "Crédito tributario de IVA", "ASSET", "TAX_CREDIT", 108.25, "Nota 8"],
  ["2.1.01", "Cuentas por pagar proveedores", "LIABILITY", "PAYABLES", 195.9, "Nota 9"],
  ["2.1.02", "Intereses por pagar", "LIABILITY", "INTEREST_PAYABLE", 3555.57, "Nota 10"],
  ["2.1.03", "IESS aporte patronal por pagar", "LIABILITY", "PAYROLL_LIABILITIES", 232.76, "Nota 11"],
  ["2.1.04", "IESS aporte personal por pagar", "LIABILITY", "PAYROLL_LIABILITIES", 189.01, "Nota 11"],
  ["2.1.05", "Fondos de reserva por pagar", "LIABILITY", "PAYROLL_LIABILITIES", 499.8, "Nota 11"],
  ["2.2.01", "Préstamos de accionistas", "LIABILITY", "SHAREHOLDER_LOANS", 64899.15, "Nota 12 (desglose por persona: QuickBooks)"],
  ["2.2.02", "Préstamo a mutuo", "LIABILITY", "RELATED_LOANS", 25569.35, "Nota 12"],
  ["3.1.01", "Capital suscrito", "EQUITY", "CAPITAL", 1000.0, "Nota 13"],
  ["3.2.01", "(−) Pérdidas acumuladas de ejercicios anteriores", "EQUITY", "RETAINED_EARNINGS", -56826.28, "Estado de situación"],
  ["3.2.02", "(−) Pérdida del ejercicio 2025", "EQUITY", "RETAINED_EARNINGS", -19305.33, "Estado de resultados"],
];

const cents = (usd: number) => Math.round(usd * 100);

async function main() {
  const write = process.argv.includes("--write");
  const sum = (t: LedgerAccountType) => ROWS.filter((r) => r[2] === t).reduce((a, r) => a + cents(r[4]), 0);
  const [a, l, e] = [sum("ASSET"), sum("LIABILITY"), sum("EQUITY")];
  console.log(`Activo ${a / 100} · Pasivo ${l / 100} · Patrimonio ${e / 100} · Pasivo + Patrimonio ${(l + e) / 100}`);
  if (a !== 2000993 || l !== 9514154 || e !== -7513161 || a !== l + e) {
    throw new Error("Los saldos no coinciden con los EEFF firmados (20.009,93 / 95.141,54 / −75.131,61).");
  }
  console.log("✅ Cuadra con los EEFF firmados.");
  if (!write) return console.log("(simulación: usa --write para guardar)");

  const bank = await prisma.bankAccount.findFirst({ where: { sede: "XTREME", statementFormat: "PACIFICO", active: true } });
  for (const [code, name, type, role, usd, note] of ROWS) {
    const acct = await prisma.ledgerAccount.upsert({
      where: { sede_code: { sede: "XTREME", code } },
      create: { sede: "XTREME", code, name, type, role, bankAccountId: role === "BANK" ? bank?.id : null },
      update: { name, type, role, ...(role === "BANK" ? { bankAccountId: bank?.id ?? null } : {}) },
    });
    const existing = await prisma.openingBalance.findFirst({ where: { accountId: acct.id, asOf: AS_OF, person: null } });
    const data = { amountCents: cents(usd), source: `${SOURCE} · ${note}` };
    if (existing) await prisma.openingBalance.update({ where: { id: existing.id }, data });
    else await prisma.openingBalance.create({ data: { accountId: acct.id, asOf: AS_OF, ...data } });
  }
  console.log(`Guardadas ${ROWS.length} cuentas con su saldo al 31-dic-2025.${bank ? "" : " ⚠️ No encontré la cuenta Pacífico Xtreme para enlazar."}`);
  await prisma.$disconnect();
}

main();
