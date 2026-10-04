"use server";

// Payers (4 oct 2026): who pays for one or more members and receives their
// invoice — e.g. a mother paying for her two children. Their ID never goes on
// the member's file. Front desk can create and assign them, like payments.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, getSedeScope } from "@/lib/auth";
import type { TaxIdType } from "@/generated/prisma/client";
import { taxIdError } from "@/lib/invoicing/core";

async function requirePayers() {
  const user = await requireAuth();
  if (!(user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN")) throw new Error("No autorizado");
  return user;
}

const TYPES: TaxIdType[] = ["CEDULA", "RUC", "PASAPORTE"];

export type PayerInput = {
  id?: string;
  name: string;
  taxIdType: TaxIdType;
  taxId: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

function clean(input: PayerInput) {
  if (!TYPES.includes(input.taxIdType)) throw new Error("Tipo de identificación inválido.");
  const err = taxIdError(input.taxIdType, input.taxId);
  if (err) throw new Error(err);
  const name = input.name.trim();
  if (!name) throw new Error("Falta el nombre o la razón social.");
  const opt = (v?: string) => v?.trim() || null;
  return {
    name: name.slice(0, 200),
    taxIdType: input.taxIdType,
    taxId: input.taxId.trim().toUpperCase(),
    email: opt(input.email),
    phone: opt(input.phone),
    address: opt(input.address),
    notes: opt(input.notes),
  };
}

/** Creates or updates a payer; with `memberId`, also makes it that member's payer. */
export async function savePayer(input: PayerInput, memberId?: string): Promise<{ id: string }> {
  const user = await requirePayers();
  const data = clean(input);
  const clash = await prisma.payer.findUnique({ where: { taxIdType_taxId: { taxIdType: data.taxIdType, taxId: data.taxId } } });
  if (clash && clash.id !== input.id) {
    throw new Error(`Ya existe un pagador con esa identificación: ${clash.name}. Asígnalo en vez de crear otro.`);
  }
  const payer = input.id ? await prisma.payer.update({ where: { id: input.id }, data }) : await prisma.payer.create({ data });
  if (memberId) await assign(user, memberId, payer.id);
  revalidatePath("/dashboard/finanzas/pagadores", "layout");
  return { id: payer.id };
}

async function assign(user: Awaited<ReturnType<typeof requirePayers>>, memberId: string, payerId: string | null) {
  const scope = getSedeScope(user);
  const member = await prisma.member.findFirst({
    where: scope ? { id: memberId, OR: [{ sede: scope }, { secondarySede: scope }] } : { id: memberId },
    select: { id: true },
  });
  if (!member) throw new Error("No se encontró el socio.");
  await prisma.member.update({ where: { id: memberId }, data: { payerId } });
  revalidatePath(`/dashboard/socios/${memberId}`);
}

/** Sets (or clears, with null) who pays for a member. */
export async function setMemberPayer(memberId: string, payerId: string | null) {
  const user = await requirePayers();
  if (payerId && !(await prisma.payer.findUnique({ where: { id: payerId }, select: { id: true } }))) {
    throw new Error("No se encontró el pagador.");
  }
  await assign(user, memberId, payerId);
  revalidatePath("/dashboard/finanzas/pagadores", "layout");
}
