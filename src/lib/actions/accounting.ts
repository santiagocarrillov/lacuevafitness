"use server";

// Contabilidad (libro diario). OWNER/ACCOUNTING only. Design:
// docs/contabilidad-libro-diario.md

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import type { Sede } from "@/generated/prisma/client";
import { createEntry, voidEntry } from "@/lib/accounting/journal";
import { assertOpen, lockedThrough, postingWindow, syncJournal, type SyncResult } from "@/lib/accounting/posting";
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
  await assertOpen(prisma, checkSede(input.sede), day(input.date));
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
  await assertOpen(prisma, e.sede, e.date);
  await voidEntry(prisma, id, reason);
  revalidatePath(PATH);
}

// ── Automatic posting & period close ────────────────────────────────────────

/** Posts/updates the entries derived from documents (idempotent). */
export async function syncAccounting(sede: Sede): Promise<SyncResult> {
  const user = await requireView();
  const s = checkSede(sede);
  return prisma.$transaction(
    async (tx) => {
      const { from, to } = await postingWindow(tx, s);
      return syncJournal(tx, s, from, to, user.id);
    },
    { timeout: 120_000 },
  );
}

export async function getLockedThrough(sede: Sede): Promise<string | null> {
  await requireView();
  const d = await lockedThrough(prisma, checkSede(sede));
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Close every day up to the end of `ym`. Everything must be posted first. */
export async function closePeriod(sede: string, ym: string) {
  const user = await requireEdit();
  const s = checkSede(sede);
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error("Mes inválido.");
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (last.getTime() >= today.getTime()) throw new Error("Solo se cierran meses que ya terminaron.");
  await prisma.$transaction(
    async (tx) => {
      const current = await lockedThrough(tx, s);
      if (current && current.getTime() >= last.getTime()) throw new Error("Ese mes ya está cerrado.");
      const { from, to } = await postingWindow(tx, s);
      const r = await syncJournal(tx, s, from, to, user.id);
      if (r.errors.length) throw new Error(`Hay documentos que no se pudieron contabilizar: ${r.errors[0]}`);
      await tx.periodClose.create({ data: { sede: s, lockedThrough: last, closedById: user.id } });
    },
    { timeout: 120_000 },
  );
  revalidatePath(PATH);
}

/** Reopen the latest close (OWNER only). */
export async function reopenPeriod(sede: string) {
  const user = await requireAuth();
  if (user.role !== "OWNER") throw new Error("Solo el dueño puede reabrir un mes cerrado.");
  const s = checkSede(sede);
  const c = await prisma.periodClose.findFirst({ where: { sede: s, reopenedAt: null }, orderBy: { lockedThrough: "desc" } });
  if (!c) throw new Error("No hay meses cerrados.");
  await prisma.periodClose.update({ where: { id: c.id }, data: { reopenedAt: new Date(), reopenedById: user.id } });
  revalidatePath(PATH);
}
