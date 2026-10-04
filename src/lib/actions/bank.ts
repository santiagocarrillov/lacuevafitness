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
import type { BankAccountKind, BankStatementFormat, Prisma, Sede } from "@/generated/prisma/client";
import { natural } from "@/lib/accounting/reports";
import { idsMatching, SEARCH_SOURCES } from "@/lib/text-search";
import type { TxnFilters } from "@/lib/finance/bank-filters";
import { FORMAT_LABELS, parseStatement, type Cell } from "@/lib/finance/bank-parsers";
import type { Decision } from "@/lib/finance/bank-suggest";
import { buildInbox, classifyInTx, undoInTx, type InboxLine } from "@/lib/finance/bank-core";
import { ENTITY_ORDER } from "@/lib/finance/entities";

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

export async function getInbox(accountId?: string, sedes: Sede[] = ENTITY_ORDER): Promise<InboxLine[]> {
  await requireView();
  return buildInbox(accountId ? { accountId } : { account: { sede: { in: sedes } } });
}

// ── Overview (Caja y Bancos › Resumen) ──────────────────────────────────────

export type AccountSummary = {
  id: string;
  name: string;
  bank: string;
  last4: string | null;
  sede: Sede;
  kind: BankAccountKind;
  lines: number;
  pendingCount: number;
  pendingCents: number;
  /** Personal and ignored lines: in the statement, never in the books. */
  offBooksCents: number;
  firstPostedAt: Date | null;
  lastPostedAt: Date | null;
  bankCents: number | null;
  bankAsOf: Date | null;
  /** null when the account is not wired to the chart of accounts. */
  bookCents: number | null;
  ledgerAccountId: string | null;
};

export type BankOverview = {
  accounts: AccountSummary[];
  /** Ledger balances per entity: cash on hand, the bridge, transfers in transit. */
  ledger: { sede: Sede; code: string; name: string; accountId: string; cents: number }[];
  /** Money in/out through the banks by month (personal, ignored and transfers left out). */
  months: { ym: string; inCents: number; outCents: number }[];
};

export async function bankOverview(sedes: Sede[], monthsBack = 6): Promise<BankOverview> {
  await requireView();
  const accounts = await prisma.bankAccount.findMany({
    where: { active: true, sede: { in: sedes } },
    orderBy: [{ sede: "asc" }, { name: "asc" }],
    include: { ledgerAccounts: { select: { id: true } } },
  });
  const ids = accounts.map((a) => a.id);
  const [byStatus, range, offBooks] = await Promise.all([
    prisma.bankTransaction.groupBy({ by: ["accountId", "status"], where: { accountId: { in: ids } }, _count: { _all: true }, _sum: { amountCents: true } }),
    prisma.bankTransaction.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _min: { postedAt: true }, _max: { postedAt: true } }),
    prisma.bankTransaction.groupBy({
      by: ["accountId"],
      where: { accountId: { in: ids }, OR: [{ status: "IGNORED" }, { kind: "PERSONAL" }] },
      _sum: { amountCents: true },
    }),
  ]);
  const summaries = await Promise.all(
    accounts.map(async (a): Promise<AccountSummary> => {
      const ledgerIds = a.ledgerAccounts.map((l) => l.id);
      const [last, book] = await Promise.all([
        prisma.bankTransaction.findFirst({
          where: { accountId: a.id, balanceCents: { not: null } },
          orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
          select: { balanceCents: true, postedAt: true },
        }),
        ledgerIds.length
          ? prisma.journalLine.aggregate({ where: { accountId: { in: ledgerIds }, entry: { status: "POSTED" } }, _sum: { debitCents: true, creditCents: true } })
          : null,
      ]);
      const st = byStatus.filter((g) => g.accountId === a.id);
      const pending = st.find((g) => g.status === "PENDING");
      const r = range.find((g) => g.accountId === a.id);
      return {
        id: a.id, name: a.name, bank: a.bank, last4: a.last4, sede: a.sede, kind: a.kind,
        lines: st.reduce((n, g) => n + g._count._all, 0),
        pendingCount: pending?._count._all ?? 0,
        pendingCents: pending?._sum.amountCents ?? 0,
        offBooksCents: offBooks.find((g) => g.accountId === a.id)?._sum.amountCents ?? 0,
        firstPostedAt: r?._min.postedAt ?? null,
        lastPostedAt: r?._max.postedAt ?? null,
        bankCents: last?.balanceCents ?? null,
        bankAsOf: last?.postedAt ?? null,
        bookCents: book ? natural("ASSET", book._sum.debitCents ?? 0, book._sum.creditCents ?? 0) : null,
        ledgerAccountId: ledgerIds[0] ?? null,
      };
    }),
  );

  const codes = ["1.1.01", "1.1.05", "1.1.07"];
  const ledgerAccounts = await prisma.ledgerAccount.findMany({ where: { sede: { in: sedes }, code: { in: codes } } });
  const sums = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: { accountId: { in: ledgerAccounts.map((l) => l.id) }, entry: { status: "POSTED" } },
    _sum: { debitCents: true, creditCents: true },
  });
  const ledger = ledgerAccounts
    .map((l) => {
      const g = sums.find((x) => x.accountId === l.id);
      return { sede: l.sede, code: l.code, name: l.name, accountId: l.id, cents: natural("ASSET", g?._sum.debitCents ?? 0, g?._sum.creditCents ?? 0) };
    })
    .sort((a, b) => a.code.localeCompare(b.code) || a.sede.localeCompare(b.sede));

  const today = ecuadorDateString();
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const firstYm = new Date(Date.UTC(y, m - monthsBack, 1));
  const flows = await prisma.bankTransaction.findMany({
    where: {
      accountId: { in: ids },
      postedAt: { gte: firstYm },
      status: { not: "IGNORED" },
      OR: [{ kind: null }, { kind: { notIn: ["PERSONAL", "INTERNAL_TRANSFER"] } }],
    },
    select: { postedAt: true, amountCents: true },
  });
  const months = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(Date.UTC(y, m - monthsBack + i, 1));
    return { ym: d.toISOString().slice(0, 7), inCents: 0, outCents: 0 };
  });
  for (const f of flows) {
    const row = months.find((x) => x.ym === ecuadorDateString(f.postedAt).slice(0, 7));
    if (!row) continue;
    if (f.amountCents > 0) row.inCents += f.amountCents;
    else row.outCents -= f.amountCents;
  }
  return { accounts: summaries, ledger, months };
}

// ── Movimientos (every statement line, with filters) ────────────────────────

const PAGE_SIZE = 50;
const dayStart = (ymd: string) => new Date(`${ymd}T05:00:00.000Z`); // 00:00 in Ecuador

export async function listTransactions(f: TxnFilters, sedes: Sede[]) {
  await requireView();
  const matchIds = f.q ? await idsMatching(SEARCH_SOURCES.bankTxn, f.q) : null;
  const end = new Date(dayStart(f.hasta).getTime() + 86_400_000);
  const where: Prisma.BankTransactionWhereInput = {
    account: { active: true, sede: { in: f.sede ? [f.sede] : sedes } },
    postedAt: { gte: dayStart(f.desde), lt: end },
    ...(f.cuenta ? { accountId: f.cuenta } : {}),
    ...(f.estado ? { status: f.estado === "pendiente" ? "PENDING" : f.estado === "ignorado" ? "IGNORED" : "CLASSIFIED" } : {}),
    ...(f.tipo ? { kind: f.tipo } : {}),
    ...(f.dir ? { amountCents: f.dir === "entradas" ? { gt: 0 } : { lt: 0 } } : {}),
    ...(matchIds ? { id: { in: matchIds } } : {}),
  };
  const [total, rows, ins, outs] = await Promise.all([
    prisma.bankTransaction.count({ where }),
    prisma.bankTransaction.findMany({
      where,
      include: { account: { select: { name: true, last4: true, sede: true } } },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.bankTransaction.aggregate({ where: { AND: [where, { amountCents: { gt: 0 } }] }, _sum: { amountCents: true } }),
    prisma.bankTransaction.aggregate({ where: { AND: [where, { amountCents: { lt: 0 } }] }, _sum: { amountCents: true } }),
  ]);
  return {
    rows,
    total,
    page: f.page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    inCents: ins._sum.amountCents ?? 0,
    outCents: -(outs._sum.amountCents ?? 0),
  };
}

// ── One movement: what it is and everything it created ──────────────────────

export async function getTransaction(id: string) {
  await requireView();
  const line = await prisma.bankTransaction.findUnique({
    where: { id },
    include: {
      account: true,
      payments: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
      expenses: { select: { id: true, description: true, amountCents: true, category: true, voidedAt: true, supplierName: true } },
      capitalMovements: { select: { id: true, person: true, kind: true, amountCents: true, voidedAt: true } },
      otherIncomes: { select: { id: true, description: true, amountCents: true, voidedAt: true } },
      payrollLines: { include: { run: { select: { id: true, period: true } }, employee: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!line) return null;
  const [inbox, entries, classifiedBy] = await Promise.all([
    line.status === "PENDING" ? buildInbox({ id }, 1).then((r) => r[0] ?? null) : null,
    prisma.journalEntry.findMany({
      where: { sede: line.account.sede, status: "POSTED", OR: [{ source: "BANK", sourceId: id }, { source: "PAYROLL", sourceId: { endsWith: `:banco:${id}` } }] },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: { number: "asc" },
    }),
    line.classifiedById ? prisma.user.findUnique({ where: { id: line.classifiedById }, select: { fullName: true } }) : null,
  ]);
  return { line, inbox, entries, classifiedByName: classifiedBy?.fullName ?? null };
}

/** Liability accounts a loan instalment's principal can reduce, per entity. */
export async function loanAccounts(sedes: Sede[]) {
  await requireView();
  const rows = await prisma.ledgerAccount.findMany({
    where: { sede: { in: sedes }, type: "LIABILITY", postable: true, active: true, role: { notIn: ["PAYROLL_LIABILITIES"] } },
    select: { sede: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  return rows.filter((r) => !["2.1.06", "2.1.07"].includes(r.code));
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
