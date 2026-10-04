// Name/text search that ignores case and accents ("maria" finds "María",
// "nunez" finds "Núñez"), for every list and picker of the app. Same folding
// as the WhatsApp inbox (lib/whatsapp/search.ts): translate() in Postgres, no
// extension. Several words must all appear, in any column ("maria rojas"
// matches first name María + last name Rojas). No auth — callers check.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { SQL_ACCENTS_FROM, SQL_ACCENTS_TO, foldText, likePattern } from "@/lib/whatsapp/search";

/** Folded words of a query. A local phone ("0996…") drops its 0 so it also matches "+593996…". */
export function searchWords(q: string, minLength = 1): string[] {
  return foldText(q.trim())
    .split(/\s+/)
    .filter((w) => w.length >= minLength)
    .map((w) => (/^0\d{5,}$/.test(w) ? w.slice(1) : w))
    .slice(0, 6);
}

type Source = {
  /** FROM clause (code constant, never user input). */
  from: string;
  /** Column holding the id to return. */
  id: string;
  /** Text columns searched together. */
  columns: string[];
};

const q = (c: string) => c.split(".").map((p) => `"${p}"`).join(".");
const table = (t: string, columns: string[]): Source => ({ from: `"${t}"`, id: `"id"`, columns: columns.map(q) });

export const SEARCH_SOURCES = {
  member: table("Member", ["firstName", "lastName", "email", "phone", "taxId"]),
  memberName: table("Member", ["firstName", "lastName"]),
  lead: table("Lead", ["firstName", "lastName", "email", "phone"]),
  payer: table("Payer", ["name", "taxId", "email"]),
  recipe: table("Recipe", ["title"]),
  supplier: table("Supplier", ["name", "tradeName", "taxId", "email", "contactName"]),
  expense: {
    from: `"Expense" e LEFT JOIN "Supplier" s ON s."id" = e."supplierId"`,
    id: `e."id"`,
    columns: [`e."supplierName"`, `e."supplierRuc"`, `e."description"`, `e."documentNumber"`, `e."notes"`, `s."tradeName"`],
  },
  payment: {
    from: `"Payment" p LEFT JOIN "Member" m ON m."id" = p."memberId" LEFT JOIN "Invoice" i ON i."id" = p."invoiceId" LEFT JOIN "Payer" y ON y."id" = p."payerId"`,
    id: `p."id"`,
    columns: [`m."firstName"`, `m."lastName"`, `p."depositorName"`, `p."bankReference"`, `i."buyerName"`, `y."name"`],
  },
} satisfies Record<string, Source>;

/**
 * Ids whose text contains every word of `query`, ignoring case and accents.
 * null when the query has no words (= don't filter).
 */
export async function idsMatching(
  source: Source,
  query: string,
  opts: { minLength?: number; limit?: number } = {},
): Promise<string[] | null> {
  const words = searchWords(query, opts.minLength);
  if (words.length === 0) return null;
  const hay = Prisma.sql`translate(lower(concat_ws(' ', ${Prisma.raw(source.columns.join(", "))})), ${SQL_ACCENTS_FROM}, ${SQL_ACCENTS_TO})`;
  const conds = Prisma.join(
    words.map((w) => Prisma.sql`${hay} LIKE ${likePattern(w)}`),
    " AND ",
  );
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ${Prisma.raw(source.id)} AS "id" FROM ${Prisma.raw(source.from)} WHERE ${conds} LIMIT ${opts.limit ?? 3000}`;
  return rows.map((r) => r.id);
}
