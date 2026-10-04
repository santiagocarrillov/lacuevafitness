"use server";

// Finanzas 1b — bank statements: import, reconciliation inbox, classification
// with exact undo, and learned rules. Design: docs/finanzas-fase1.md
// Every classification is one DB transaction and records what it touched in
// BankTransaction.appliedJson so "Deshacer" restores the previous state.

import { createHash, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { readSheet } from "read-excel-file/universal";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import type { BankAccountKind, BankStatementFormat } from "@/generated/prisma/client";
import { FORMAT_LABELS, parseStatement, type Cell } from "@/lib/finance/bank-parsers";
import type { Decision } from "@/lib/finance/bank-suggest";
import { buildInbox, classifyInTx, undoInTx, type InboxLine } from "@/lib/finance/bank-core";

const PATH = "/dashboard/finanzas";

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

// ── Accounts ────────────────────────────────────────────────────────────────

export async function listBankAccounts() {
  await requireView();
  const [accounts, pending, last] = await Promise.all([
    prisma.bankAccount.findMany({ where: { active: true }, orderBy: [{ sede: "asc" }, { name: "asc" }] }),
    prisma.bankTransaction.groupBy({ by: ["accountId"], where: { status: "PENDING" }, _count: { _all: true } }),
    prisma.bankTransaction.groupBy({ by: ["accountId"], _max: { postedAt: true }, _min: { postedAt: true } }),
  ]);
  return accounts.map((a) => ({
    ...a,
    pendingCount: pending.find((p) => p.accountId === a.id)?._count._all ?? 0,
    firstPostedAt: last.find((l) => l.accountId === a.id)?._min.postedAt ?? null,
    lastPostedAt: last.find((l) => l.accountId === a.id)?._max.postedAt ?? null,
  }));
}

const FORMATS: BankStatementFormat[] = ["PACIFICO", "PICHINCHA", "PRODUBANCO"];

export async function createBankAccount(fd: FormData) {
  await requireEdit();
  const sede = String(fd.get("sede"));
  if (sede !== "FITNESS_CENTER" && sede !== "XTREME") throw new Error("Elige la entidad.");
  const statementFormat = String(fd.get("statementFormat")) as BankStatementFormat;
  if (!FORMATS.includes(statementFormat)) throw new Error("Elige el banco.");
  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("Ponle un nombre a la cuenta (p. ej. Pichincha Santiago).");
  const last4 = String(fd.get("last4") ?? "").trim() || null;
  if (last4 && !/^\d{4}$/.test(last4)) throw new Error("Últimos 4 dígitos: solo números.");
  const kind: BankAccountKind = fd.get("kind") === "PERSONAL_MIXED" ? "PERSONAL_MIXED" : "BUSINESS";
  await prisma.bankAccount.create({
    data: { sede, name, bank: FORMAT_LABELS[statementFormat], last4, kind, statementFormat },
  });
  revalidatePath(PATH, "layout");
}

export async function deactivateBankAccount(id: string) {
  await requireEdit();
  await prisma.bankAccount.update({ where: { id }, data: { active: false } });
  revalidatePath(PATH, "layout");
}

// ── Import ──────────────────────────────────────────────────────────────────

export type ImportResult = {
  format: BankStatementFormat;
  total: number;
  created: number;
  duplicates: number;
  from: string | null;
  to: string | null;
  autoApplied: number;
};

function fingerprint(accountId: string, l: ReturnType<typeof parseStatement>["lines"][number]) {
  return createHash("sha256")
    .update([accountId, l.postedAt.toISOString(), l.amountCents, l.reference ?? "", l.description, l.balanceCents ?? ""].join("|"))
    .digest("hex");
}

export async function importStatement(fd: FormData): Promise<ImportResult> {
  const user = await requireEdit();
  const account = await prisma.bankAccount.findUnique({ where: { id: String(fd.get("accountId")) } });
  if (!account || !account.active) throw new Error("Elige la cuenta.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Elige el archivo del banco (.xlsx).");
  if (file.size > 1024 * 1024) throw new Error("El archivo pesa más de 1 MB: descarga un rango de fechas más corto.");

  let rows: Cell[][];
  try {
    rows = (await readSheet(await file.arrayBuffer())) as Cell[][];
  } catch {
    throw new Error("No pude abrir el archivo. Debe ser el .xlsx que descarga el banco.");
  }
  const st = parseStatement(rows);
  if (st.format !== account.statementFormat) {
    throw new Error(`El archivo es de ${FORMAT_LABELS[st.format]} y la cuenta elegida es de ${FORMAT_LABELS[account.statementFormat]}.`);
  }
  if (st.accountNumber && account.last4 && !st.accountNumber.endsWith(account.last4)) {
    throw new Error(`El archivo es de la cuenta …${st.accountNumber.slice(-4)}, no de …${account.last4}.`);
  }
  if (st.lines.length === 0) throw new Error("El archivo no tiene movimientos.");

  const importBatch = randomUUID();
  const res = await prisma.bankTransaction.createMany({
    data: st.lines.map((l) => ({
      accountId: account.id,
      postedAt: l.postedAt,
      amountCents: l.amountCents,
      description: l.description,
      counterparty: l.counterparty,
      reference: l.reference,
      balanceCents: l.balanceCents,
      fingerprint: fingerprint(account.id, l),
      importBatch,
    })),
    skipDuplicates: true,
  });

  // Rule-based lines (fees, taxes, learned rules) are applied right away.
  const autoApplied = await applyConfident(user.id, { accountId: account.id, importBatch, onlyRules: true });

  const times = st.lines.map((l) => l.postedAt.getTime());
  revalidatePath(PATH, "layout");
  return {
    format: st.format,
    total: st.lines.length,
    created: res.count,
    duplicates: st.lines.length - res.count,
    from: ecuadorDateString(new Date(Math.min(...times))),
    to: ecuadorDateString(new Date(Math.max(...times))),
    autoApplied,
  };
}

export async function getInbox(accountId?: string): Promise<InboxLine[]> {
  await requireView();
  return buildInbox(accountId ? { accountId } : {});
}

export async function listClassified(accountId?: string) {
  await requireView();
  return prisma.bankTransaction.findMany({
    where: { status: { in: ["CLASSIFIED", "IGNORED"] }, ...(accountId ? { accountId } : {}) },
    include: { account: { select: { name: true } } },
    orderBy: { classifiedAt: "desc" },
    take: 40,
  });
}

export async function classifyLine(txnId: string, decision: Decision, remember?: { pattern: string }) {
  const user = await requireEdit();
  await prisma.$transaction((tx) => classifyInTx(tx, user.id, txnId, decision, remember));
  revalidatePath(PATH, "layout");
  revalidatePath("/dashboard/pagos");
}

/** Applies confident suggestions. `onlyRules` skips member-payment matches. */
async function applyConfident(
  userId: string,
  filter: { accountId?: string; importBatch?: string; onlyRules?: boolean },
): Promise<number> {
  const inbox = await buildInbox({ accountId: filter.accountId, importBatch: filter.importBatch }, 500);
  let n = 0;
  for (const l of inbox) {
    const s = l.suggestion;
    if (!s?.confident) continue;
    if (filter.onlyRules && s.decision.type === "MEMBER_PAYMENTS") continue;
    try {
      await prisma.$transaction((tx) => classifyInTx(tx, userId, l.id, s.decision));
      n++;
    } catch {
      // A conflicting line (e.g. a payment already taken) stays in the inbox.
    }
  }
  return n;
}

export async function applySafeSuggestions(accountId?: string): Promise<number> {
  const user = await requireEdit();
  const n = await applyConfident(user.id, { accountId });
  revalidatePath(PATH, "layout");
  revalidatePath("/dashboard/pagos");
  return n;
}

export async function undoLine(txnId: string) {
  await requireEdit();
  await prisma.$transaction((tx) => undoInTx(tx, txnId));
  revalidatePath(PATH, "layout");
  revalidatePath("/dashboard/pagos");
}

// ── Rules ───────────────────────────────────────────────────────────────────

export async function listRules() {
  await requireView();
  return prisma.bankRule.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } });
}

export async function deactivateRule(id: string) {
  await requireEdit();
  await prisma.bankRule.update({ where: { id }, data: { active: false } });
  revalidatePath(PATH, "layout");
}
