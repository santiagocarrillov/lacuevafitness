"use server";

// Supplier directory (4 oct 2026). Expenses link themselves to a supplier when
// saved (lib/finance/suppliers.ts); here accounting completes the data: RUC,
// contact, payment terms and the usual expense account.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import type { TaxIdType } from "@/generated/prisma/client";
import { taxIdError } from "@/lib/invoicing/core";

async function requireDirectory() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");
  return user;
}

export type SupplierInput = {
  id?: string;
  name: string;
  tradeName?: string;
  taxIdType?: TaxIdType | null;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  contactName?: string;
  defaultAccountCode?: string;
  paymentTermsDays?: number | null;
  notes?: string;
};

export async function saveSupplier(input: SupplierInput): Promise<{ id: string }> {
  await requireDirectory();
  const name = input.name.trim();
  if (!name) throw new Error("Falta la razón social o el nombre.");
  const taxId = input.taxId?.trim() || null;
  const taxIdType = taxId ? input.taxIdType ?? (taxId.length === 13 ? "RUC" : "CEDULA") : null;
  if (taxId && taxIdType) {
    const err = taxIdError(taxIdType, taxId);
    if (err) throw new Error(err);
    const clash = await prisma.supplier.findUnique({ where: { taxId }, select: { id: true, name: true } });
    if (clash && clash.id !== input.id) throw new Error(`Ya existe un proveedor con ese RUC: ${clash.name}.`);
  }
  const terms = input.paymentTermsDays;
  if (terms != null && (!Number.isInteger(terms) || terms < 0 || terms > 365)) throw new Error("Plazo de pago: de 0 a 365 días.");
  const opt = (v?: string) => v?.trim() || null;
  const data = {
    name: name.slice(0, 200),
    tradeName: opt(input.tradeName),
    taxId,
    taxIdType,
    email: opt(input.email),
    phone: opt(input.phone),
    address: opt(input.address),
    contactName: opt(input.contactName),
    defaultAccountCode: opt(input.defaultAccountCode),
    paymentTermsDays: terms ?? null,
    notes: opt(input.notes),
  };
  const s = input.id ? await prisma.supplier.update({ where: { id: input.id }, data }) : await prisma.supplier.create({ data });
  revalidatePath("/dashboard/finanzas/proveedores", "layout");
  return { id: s.id };
}

/** Archive (or restore) a supplier: it leaves the directory and the pickers; its documents stay. */
export async function setSupplierActive(id: string, active: boolean) {
  await requireDirectory();
  await prisma.supplier.update({ where: { id }, data: { active } });
  revalidatePath("/dashboard/finanzas/proveedores", "layout");
}

/** Joins a duplicate into another supplier (e.g. "Kywi" typed by hand into "KYWI S.A."). */
export async function mergeSupplier(fromId: string, intoId: string) {
  await requireDirectory();
  if (fromId === intoId) throw new Error("Elige otro proveedor.");
  await prisma.$transaction([
    prisma.expense.updateMany({ where: { supplierId: fromId }, data: { supplierId: intoId } }),
    prisma.supplier.update({ where: { id: fromId }, data: { active: false, notes: `Unido a otro proveedor (${intoId})` } }),
  ]);
  revalidatePath("/dashboard/finanzas/proveedores", "layout");
}
