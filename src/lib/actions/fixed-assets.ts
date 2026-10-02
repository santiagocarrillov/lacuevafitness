"use server";

// Registro de activos fijos (OWNER/ACCOUNTING). The monthly depreciation and
// disposal entries are derived from these rows by the journal sync.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { assertOpen } from "@/lib/accounting/posting";
import { DEFAULT_LIFE_MONTHS, FIXED_ASSET_CODES, accumulatedThrough, chargeForMonth, monthIdx } from "@/lib/accounting/depreciation";
import { ecuadorDateString } from "@/lib/timezone";
import type { Sede } from "@/generated/prisma/client";

const PATH = "/dashboard/contabilidad";

async function requireEdit() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");
  return user;
}

const day = (v: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label}: fecha inválida.`);
  return new Date(`${v}T00:00:00.000Z`);
};
const firstOfNextMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

export async function listFixedAssets(sede: Sede) {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) throw new Error("No autorizado");
  const [assets, pending] = await Promise.all([
    prisma.fixedAsset.findMany({ where: { sede }, include: { account: { select: { code: true, name: true } }, expenseLine: { select: { expenseId: true } } }, orderBy: [{ acquiredOn: "asc" }, { name: "asc" }] }),
    // Purchases filed to an asset account that are not in the register yet.
    prisma.expenseLine.findMany({
      where: { fixedAsset: null, account: { sede, code: { in: FIXED_ASSET_CODES } }, expense: { voidedAt: null } },
      include: { account: { select: { code: true, name: true } }, expense: { select: { date: true, supplierName: true } } },
      orderBy: { expense: { date: "asc" } },
    }),
  ]);
  const nowIdx = monthIdx(new Date(`${ecuadorDateString()}T00:00:00Z`));
  return {
    assets: assets.map((a) => {
      const acc = Math.min(a.costCents, accumulatedThrough(a, a.disposedOn ? monthIdx(a.disposedOn) - 1 : nowIdx));
      return { ...a, monthlyCents: chargeForMonth(a, Math.max(nowIdx, monthIdx(a.startsOn))), accumulatedCents: acc, netCents: a.costCents - acc };
    }),
    pending,
  };
}

export async function registerAssetFromLine(lineId: string) {
  const user = await requireEdit();
  const line = await prisma.expenseLine.findUniqueOrThrow({
    where: { id: lineId },
    include: { account: true, expense: true, fixedAsset: { select: { id: true } } },
  });
  if (line.fixedAsset) throw new Error("Esa compra ya está en el registro.");
  if (!FIXED_ASSET_CODES.includes(line.account.code)) throw new Error("La línea no es de una cuenta de activo fijo.");
  if (line.expense.voidedAt) throw new Error("El gasto está anulado.");
  await prisma.fixedAsset.create({
    data: {
      sede: line.expense.sede,
      name: line.description,
      accountId: line.accountId,
      costCents: line.subtotalCents,
      acquiredOn: line.expense.date,
      usefulLifeMonths: DEFAULT_LIFE_MONTHS[line.account.code] ?? 120,
      startsOn: firstOfNextMonth(line.expense.date),
      expenseLineId: line.id,
      createdById: user.id,
    },
  });
  revalidatePath(PATH);
}

export async function updateFixedAsset(id: string, input: { name: string; usefulLifeMonths: number; residualCents: number }) {
  await requireEdit();
  const a = await prisma.fixedAsset.findUniqueOrThrow({ where: { id } });
  if (!input.name.trim()) throw new Error("Escribe el nombre.");
  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1 || input.usefulLifeMonths > 600) throw new Error("Vida útil en meses (1 a 600).");
  if (!Number.isInteger(input.residualCents) || input.residualCents < 0 || input.residualCents >= a.costCents) throw new Error("Valor residual inválido.");
  // Changing the terms re-derives past entries; closed months are kept as they are.
  await prisma.fixedAsset.update({ where: { id }, data: { name: input.name.trim(), usefulLifeMonths: input.usefulLifeMonths, residualCents: input.residualCents } });
  revalidatePath(PATH);
}

export async function disposeFixedAsset(id: string, dateYmd: string, note: string) {
  await requireEdit();
  const a = await prisma.fixedAsset.findUniqueOrThrow({ where: { id } });
  if (a.disposedOn) throw new Error("El activo ya fue dado de baja.");
  if (!note.trim()) throw new Error("Escribe el motivo (robo, daño, venta…).");
  const d = day(dateYmd, "Fecha de baja");
  if (d < a.acquiredOn) throw new Error("La baja no puede ser antes de la compra.");
  await assertOpen(prisma, a.sede, d);
  await prisma.fixedAsset.update({ where: { id }, data: { disposedOn: d, disposalNote: note.trim() } });
  revalidatePath(PATH);
}
