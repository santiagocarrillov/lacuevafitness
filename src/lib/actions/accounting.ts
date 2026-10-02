"use server";

// Contabilidad (libro diario). OWNER/ACCOUNTING only. Design:
// docs/contabilidad-libro-diario.md

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import type { Sede } from "@/generated/prisma/client";
import { createEntry, voidEntry } from "@/lib/accounting/journal";
import { generalLedger, partyBalances, statements, trialBalance } from "@/lib/accounting/reports";

const PATH = "/dashboard/contabilidad";
const SEDES: Sede[] = ["FITNESS_CENTER", "XTREME"];

async function requireView() {
  const user = await requireAuth();
  if (!can.viewFinancials(user)) throw new Error("No autorizado");
  return user;
}
async function requireEdit() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");
  return user;
}
function checkSede(sede: string): Sede {
  if (!SEDES.includes(sede as Sede)) throw new Error("Entidad inválida.");
  return sede as Sede;
}
function day(v: string, label = "Fecha"): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label}: fecha inválida.`);
  return new Date(`${v}T00:00:00.000Z`);
}
function cents(v: string): number {
  if (!v.trim()) return 0;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido: "${v}"`);
  return Math.round(n * 100);
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function getAccounts(sede: Sede) {
  await requireView();
  const accounts = await prisma.ledgerAccount.findMany({
    where: { sede: checkSede(sede) },
    include: { openingBalances: { orderBy: { asOf: "desc" } } },
  });
  return accounts.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

export async function getJournal(sede: Sede, from: string, to: string) {
  await requireView();
  return prisma.journalEntry.findMany({
    where: { sede: checkSede(sede), date: { gte: day(from), lte: day(to) } },
    include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    orderBy: [{ date: "desc" }, { number: "desc" }],
  });
}

export async function getTrialBalance(sede: Sede, from: string, to: string) {
  await requireView();
  return trialBalance(prisma, checkSede(sede), day(from), day(to));
}

export async function getGeneralLedger(sede: Sede, accountId: string, from: string, to: string) {
  await requireView();
  return generalLedger(prisma, checkSede(sede), accountId, day(from), day(to));
}

export async function getStatements(sede: Sede, asOf: string) {
  await requireView();
  const s = checkSede(sede);
  const date = day(asOf);
  const [st, loans] = await Promise.all([
    statements(prisma, s, date),
    partyBalances(prisma, s, "SHAREHOLDER_LOANS", date),
  ]);
  return { ...st, loans };
}

// ── Manual entries ──────────────────────────────────────────────────────────

export type ManualLine = { accountId: string; debit: string; credit: string; memo?: string; party?: string };

export async function createManualEntry(input: {
  sede: string;
  date: string;
  description: string;
  lines: ManualLine[];
}): Promise<{ number: number }> {
  const user = await requireEdit();
  const entry = await prisma.$transaction((tx) =>
    createEntry(tx, {
      sede: checkSede(input.sede),
      date: day(input.date),
      description: input.description,
      source: "MANUAL",
      createdById: user.id,
      lines: input.lines.map((l) => ({
        accountId: l.accountId,
        debitCents: cents(l.debit),
        creditCents: cents(l.credit),
        memo: l.memo,
        party: l.party,
      })),
    }),
  );
  revalidatePath(PATH);
  return { number: entry.number };
}

/** Only manual entries are voided here; automatic ones follow their document. */
export async function voidManualEntry(id: string, reason: string) {
  await requireEdit();
  const e = await prisma.journalEntry.findUnique({ where: { id } });
  if (!e) throw new Error("Asiento no encontrado.");
  if (e.source !== "MANUAL") throw new Error("Este asiento lo generó un documento: se corrige desde ese documento.");
  await voidEntry(prisma, id, reason);
  revalidatePath(PATH);
}
