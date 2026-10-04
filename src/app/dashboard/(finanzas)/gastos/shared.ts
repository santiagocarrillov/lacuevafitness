import { prisma } from "@/lib/prisma";
import { lineAccounts } from "@/lib/expenses/core";
import type { Sede, User } from "@/generated/prisma/client";

/** Sedes and line accounts a user may record expenses with (null = no access). */
export async function expenseScope(user: User) {
  const full = user.role === "OWNER" || user.role === "ACCOUNTING";
  if (!full && !(user.role === "ADMIN" && user.sede)) return null;
  const sedes: Sede[] = full ? ["FITNESS_CENTER", "XTREME"] : [user.sede!];
  const all = await prisma.ledgerAccount.findMany({
    where: { sede: { in: sedes }, active: true },
    select: { id: true, sede: true, code: true, name: true, type: true, postable: true, expenseCategory: true },
  });
  const accounts = Object.fromEntries(
    sedes.map((s) => [s, lineAccounts(all.filter((a) => a.sede === s), { includePrivate: full }).map((a) => ({ code: a.code, name: a.name, category: a.expenseCategory }))]),
  ) as Record<Sede, { code: string; name: string; category: string | null }[]>;
  return { full, sedes, accounts };
}

/** Active suppliers for the expense editor's picker. */
export function supplierOptions() {
  return prisma.supplier.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, tradeName: true, taxId: true, defaultAccountCode: true, paymentTermsDays: true },
    take: 2000,
  });
}
