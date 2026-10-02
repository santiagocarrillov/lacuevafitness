// Journal engine (no auth — callers check permissions). Every entry balances
// (debits = credits) and only touches postable, active accounts of its own
// entity. Entries are never deleted: they are voided.

import { prisma } from "@/lib/prisma";
import type { JournalSource, Prisma, Sede } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

export type LineInput = {
  accountId: string;
  debitCents?: number;
  creditCents?: number;
  memo?: string | null;
  party?: string | null;
};

export type EntryInput = {
  sede: Sede;
  date: Date; // UTC midnight of the accounting day
  description: string;
  source: JournalSource;
  sourceId?: string | null;
  lines: LineInput[];
  createdById?: string | null;
};

/** Pure validation; returns normalized lines or throws a Spanish message. */
export function validateLines(lines: LineInput[]) {
  const norm = lines
    .map((l) => ({
      accountId: l.accountId,
      debitCents: Math.round(l.debitCents ?? 0),
      creditCents: Math.round(l.creditCents ?? 0),
      memo: l.memo?.trim() || null,
      party: l.party?.trim() || null,
    }))
    .filter((l) => l.debitCents !== 0 || l.creditCents !== 0);
  if (norm.length < 2) throw new Error("Un asiento necesita al menos dos líneas con valor.");
  for (const l of norm) {
    if (!l.accountId) throw new Error("Hay una línea sin cuenta.");
    if (l.debitCents < 0 || l.creditCents < 0) throw new Error("Los valores no pueden ser negativos.");
    if (l.debitCents > 0 && l.creditCents > 0) throw new Error("Cada línea va al debe o al haber, no a los dos.");
  }
  const debit = norm.reduce((s, l) => s + l.debitCents, 0);
  const credit = norm.reduce((s, l) => s + l.creditCents, 0);
  if (debit !== credit) {
    throw new Error(`El asiento no cuadra: debe $${(debit / 100).toFixed(2)} y haber $${(credit / 100).toFixed(2)}.`);
  }
  return { lines: norm, totalCents: debit };
}

async function nextNumber(db: Db, sede: Sede) {
  const last = await db.journalEntry.aggregate({ where: { sede }, _max: { number: true } });
  return (last._max.number ?? 0) + 1;
}

export async function createEntry(db: Db, input: EntryInput) {
  const { lines } = validateLines(input.lines);
  if (!input.description.trim()) throw new Error("Escribe la descripción del asiento.");
  const accounts = await db.ledgerAccount.findMany({ where: { id: { in: lines.map((l) => l.accountId) } } });
  for (const l of lines) {
    const a = accounts.find((x) => x.id === l.accountId);
    if (!a) throw new Error("Una de las cuentas no existe.");
    if (a.sede !== input.sede) throw new Error(`La cuenta ${a.code} es de la otra entidad.`);
    if (!a.postable) throw new Error(`${a.code} ${a.name} es una cuenta de grupo: usa una subcuenta.`);
    if (!a.active) throw new Error(`La cuenta ${a.code} está inactiva.`);
  }
  // Unique (sede, number) protects against a concurrent insert; retry once.
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.journalEntry.create({
        data: {
          sede: input.sede,
          number: await nextNumber(db, input.sede),
          date: input.date,
          description: input.description.trim(),
          source: input.source,
          sourceId: input.sourceId ?? null,
          createdById: input.createdById ?? null,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    } catch (e) {
      if (attempt < 2 && (e as { code?: string }).code === "P2002") continue;
      throw e;
    }
  }
}

export async function voidEntry(db: Db, id: string, reason: string) {
  if (!reason.trim()) throw new Error("Indica el motivo de la anulación.");
  return db.journalEntry.update({
    where: { id, status: "POSTED" },
    data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason.trim() },
  });
}

type LineKey = { accountId: string; debitCents: number; creditCents: number; party: string | null };
const key = (l: LineKey) => `${l.accountId}|${l.debitCents}|${l.creditCents}|${l.party ?? ""}`;
export function sameLines(a: LineKey[], b: LineKey[]) {
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

/**
 * Opening entry from OpeningBalance (signed statements). Idempotent: if the
 * posted opening already matches, nothing changes; otherwise it is voided
 * and re-created (e.g. after Isabel corrects an opening balance).
 */
export async function syncOpeningEntry(db: Db, sede: Sede, userId?: string | null) {
  const balances = await db.openingBalance.findMany({
    where: { account: { sede } },
    include: { account: true },
    orderBy: { asOf: "desc" },
  });
  if (balances.length === 0) return { status: "none" as const };
  const asOf = balances[0].asOf;
  const current = balances.filter((b) => b.asOf.getTime() === asOf.getTime() && b.amountCents !== 0);

  const lines: (LineInput & LineKey)[] = current.map((b) => {
    const debitNormal = b.account.type === "ASSET" || b.account.type === "EXPENSE";
    const positiveOnNormal = b.amountCents > 0;
    const abs = Math.abs(b.amountCents);
    const isDebit = debitNormal === positiveOnNormal;
    return {
      accountId: b.accountId,
      debitCents: isDebit ? abs : 0,
      creditCents: isDebit ? 0 : abs,
      party: b.person ?? null,
      memo: b.source ?? null,
    };
  });

  const existing = await db.journalEntry.findFirst({
    where: { sede, source: "OPENING", status: "POSTED" },
    include: { lines: true },
  });
  if (existing && sameLines(existing.lines, lines)) return { status: "unchanged" as const, entryId: existing.id };
  if (existing) await voidEntry(db, existing.id, "Saldos iniciales corregidos: se regenera la apertura");
  const day = asOf.toISOString().slice(0, 10);
  const entry = await createEntry(db, {
    sede,
    date: asOf,
    description: `Asiento de apertura · saldos al ${day} (EEFF firmados)`,
    source: "OPENING",
    lines,
    createdById: userId ?? null,
  });
  return { status: existing ? ("replaced" as const) : ("created" as const), entryId: entry.id };
}
