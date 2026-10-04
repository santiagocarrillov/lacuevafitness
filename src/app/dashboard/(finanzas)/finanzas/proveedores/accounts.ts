import { prisma } from "@/lib/prisma";
import { lineAccounts } from "@/lib/expenses/core";

/** Expense/asset accounts a supplier can default to (same codes in both entities). */
export async function supplierAccountOptions() {
  const all = await prisma.ledgerAccount.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true, type: true, postable: true, expenseCategory: true },
  });
  const seen = new Map<string, { code: string; name: string }>();
  for (const a of lineAccounts(all, { includePrivate: false })) if (!seen.has(a.code)) seen.set(a.code, { code: a.code, name: a.name });
  return [...seen.values()];
}
