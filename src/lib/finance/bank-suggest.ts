// Classification suggestions for bank lines (pure — no DB; client-safe).
// The action layer feeds it the line, the account, learned rules and candidate
// member payments; the UI shows the suggestion and lets accounting accept it,
// pick another option, or teach a rule.

import type {
  BankAccountKind,
  CapitalKind,
  ExpenseCategory,
  OtherIncomeCategory,
  Sede,
} from "@/generated/prisma/enums";

// ── Decisions (what accounting confirms) ────────────────────────────────────

export type Decision =
  | { type: "MEMBER_PAYMENTS"; paymentIds: string[]; /** Card settlement: book the difference as a fee. */ commission?: boolean }
  | { type: "UNASSIGNED_DEPOSIT" }
  | { type: "OTHER_INCOME"; category: OtherIncomeCategory; description: string }
  | { type: "EXPENSE"; category: ExpenseCategory; description: string; supplierName?: string }
  | { type: "CAPITAL"; kind: CapitalKind; person: string }
  | { type: "LOAN_PAYMENT"; interestCents: number; /** Liability the principal reduces (2.2.02…). */ principalCode?: string }
  /** Net salaries of one or more rol lines (one transfer per worker, or one for all). */
  | { type: "PAYROLL_NET"; lineIds: string[] }
  /** IESS planilla or SRI payment: cancels what the books left owing. */
  | { type: "LIABILITY_PAYMENT"; to: LiabilityTo; period: string; parts: LiabilityPart[]; /** Interest and fines → expense. */ extraCents: number }
  | { type: "PERSONAL" }
  | { type: "INTERNAL_TRANSFER" }
  | { type: "IGNORE" };

export type LiabilityTo = "IESS" | "SRI";

/** One account the payment cancels. Negative only for the IVA credit (1.3.01) the 104 offsets. */
export type LiabilityPart = { code: string; cents: number; label?: string };

/** What the books say is owed to the IESS / SRI for a month (proposal for a debit). */
export type LiabilityDue = { to: LiabilityTo; period: string; parts: LiabilityPart[]; totalCents: number };

/** Accounts each kind of payment may cancel. */
export const LIABILITY_CODES: Record<LiabilityTo, string[]> = {
  IESS: ["2.1.03", "2.1.04", "2.1.05", "2.1.14"],
  SRI: ["2.1.06", "1.3.01", "2.1.13"],
};

export const LIABILITY_LABELS: Record<string, string> = {
  "2.1.03": "Aporte patronal",
  "2.1.04": "Aporte personal",
  "2.1.05": "Fondos de reserva",
  "2.1.14": "Préstamos IESS descontados",
  "2.1.06": "IVA de ventas del mes",
  "1.3.01": "(−) Crédito tributario aplicado",
  "2.1.13": "Retenciones de IR a trabajadores",
};

export type Suggestion = {
  decision: Decision;
  /** Short Spanish explanation shown in the inbox. */
  reason: string;
  /** Safe to apply in bulk ("Aplicar sugerencias seguras"). */
  confident: boolean;
};

// ── Inputs ──────────────────────────────────────────────────────────────────

export type LineIn = {
  id: string;
  postedAt: Date;
  amountCents: number;
  description: string;
  counterparty: string | null;
  reference: string | null;
};

export type CandidatePayment = {
  id: string;
  amountCents: number;
  paidAt: Date | null;
  memberName: string;
  depositorName: string | null;
  method: string;
};

/** A rol line whose net salary has not been matched to a bank debit yet. */
export type PayrollCandidate = {
  id: string;
  runId: string;
  period: string;
  employeeName: string;
  netCents: number;
};

/** Pending line of another account of the same entity (transfer pairing). */
export type OtherAccountLine = LineIn & { accountName: string };

export type RuleIn = {
  id: string;
  pattern: string;
  direction: number; // 1 credits, −1 debits, 0 both
  kind: string; // BankTxnKind
  category: ExpenseCategory | null;
  /** JSON: { description?, person?, capitalKind?, otherCategory? } */
  label: string | null;
};

export type RuleLabel = {
  description?: string;
  person?: string;
  capitalKind?: CapitalKind;
  otherCategory?: OtherIncomeCategory;
};

export type ScoredCandidate = CandidatePayment & { score: number; exactAmount: boolean; matchedTokens: string[] };

// ── Text helpers ────────────────────────────────────────────────────────────

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "transf", "transferencia", "directa", "interbancaria", "recibida", "banred", "banco", "pichincha",
  "produbanco", "pacifico", "guayaquil", "internacional", "deuna", "intermatico", "cuenta", "ctas",
  "terceros", "del", "los", "las", "pago", "para",
]);

function tokens(s: string | null | undefined): string[] {
  if (!s) return [];
  return normalize(s).split(" ").filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

const OWNERS: { re: RegExp; person: string }[] = [
  { re: /cardenas salazar isabel|isabel (alejandra )?cardenas/, person: "Isabel Cárdenas" },
  { re: /carrillo velastegui santiago|santiago (andres )?carrillo/, person: "Santiago Carrillo" },
];

export function ownerOf(text: string | null): string | null {
  if (!text) return null;
  const n = normalize(text);
  return OWNERS.find((o) => o.re.test(n))?.person ?? null;
}

export const isSriDebit = (text: string) => /\bsrisece|\bsri\b/.test(normalize(text));
export const isIessDebit = (text: string) => /\biess\b/.test(normalize(text));

/** The month a tax/IESS debit pays: the one before it (both are due mid-month). */
export function duePeriod(d: Date): string {
  const [y, m] = d.toISOString().slice(0, 7).split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const FEE_RE = /\b(iva cobrado|comision|com ant|iva ant|tarifa por|cobro de iva|costo de|mantenimiento de cuenta|cargo por)\b/;

// ── Member payment scoring ──────────────────────────────────────────────────

export function scoreCandidates(line: LineIn, candidates: CandidatePayment[]): ScoredCandidate[] {
  const lineTokens = new Set(tokens(line.counterparty).concat(tokens(line.description)));
  const out: ScoredCandidate[] = [];
  for (const c of candidates) {
    const nameTokens = new Set(tokens(c.memberName).concat(tokens(c.depositorName)));
    const matched = [...nameTokens].filter((t) => lineTokens.has(t));
    const exactAmount = c.amountCents === line.amountCents;
    if (!exactAmount && matched.length === 0) continue;
    const days = c.paidAt ? Math.abs(c.paidAt.getTime() - line.postedAt.getTime()) / 86_400_000 : 30;
    const score =
      (exactAmount ? 3 : 0) + Math.min(matched.length, 3) * 2 + (days <= 3 ? 1 : 0) - (days > 10 ? 1 : 0);
    out.push({ ...c, score, exactAmount, matchedTokens: matched });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Two payments from the same payer adding up to the deposit (one person pays for two). */
function findPair(line: LineIn, scored: ScoredCandidate[]): [ScoredCandidate, ScoredCandidate] | null {
  const named = scored.filter((c) => c.matchedTokens.length > 0);
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      if (named[i].amountCents + named[j].amountCents === line.amountCents) return [named[i], named[j]];
    }
  }
  return null;
}

// ── Rules ───────────────────────────────────────────────────────────────────

export function parseRuleLabel(label: string | null): RuleLabel {
  if (!label) return {};
  try {
    return JSON.parse(label) as RuleLabel;
  } catch {
    return { description: label };
  }
}

function ruleDecision(rule: RuleIn, line: LineIn): Decision | null {
  const l = parseRuleLabel(rule.label);
  const description = l.description ?? line.counterparty ?? line.description;
  switch (rule.kind) {
    case "EXPENSE":
      return { type: "EXPENSE", category: rule.category ?? "OTHER", description };
    case "OTHER_INCOME":
      return { type: "OTHER_INCOME", category: l.otherCategory ?? "OTHER", description };
    case "CAPITAL":
      return l.person ? { type: "CAPITAL", kind: l.capitalKind ?? "CONTRIBUTION", person: l.person } : null;
    case "PERSONAL":
      return { type: "PERSONAL" };
    case "INTERNAL_TRANSFER":
      return { type: "INTERNAL_TRANSFER" };
    default:
      return null;
  }
}

export function matchRule(line: LineIn, rules: RuleIn[]): RuleIn | null {
  const hay = normalize(`${line.description} ${line.counterparty ?? ""}`);
  const dir = line.amountCents >= 0 ? 1 : -1;
  return (
    rules.find((r) => (r.direction === 0 || r.direction === dir) && hay.includes(normalize(r.pattern))) ?? null
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function suggest(
  line: LineIn,
  ctx: {
    sede: Sede;
    accountKind: BankAccountKind;
    rules: RuleIn[];
    candidates: CandidatePayment[];
    /** Other lines of the same statement (fee detection by shared reference). */
    siblings: LineIn[];
    /** Pending lines of the entity's other accounts (the other leg of a transfer). */
    otherAccounts?: OtherAccountLine[];
    /** Net salaries still to be matched to a debit. */
    payroll?: PayrollCandidate[];
    /** What the books owe the IESS / SRI for the month this debit pays. */
    due?: LiabilityDue | null;
    /** The entity runs its payroll in the app (IESS debits then cancel liabilities). */
    hasPayroll?: boolean;
  },
): { suggestion: Suggestion | null; candidates: ScoredCandidate[] } {
  const credit = line.amountCents > 0;
  const abs = Math.abs(line.amountCents);
  const text = normalize(`${line.description} ${line.counterparty ?? ""}`);
  const scored = credit ? scoreCandidates(line, ctx.candidates).slice(0, 6) : [];
  const done = (s: Suggestion | null) => ({ suggestion: s, candidates: scored });

  // 1. Learned rules win: accounting already decided this pattern.
  const rule = matchRule(line, ctx.rules);
  if (rule) {
    const d = ruleDecision(rule, line);
    if (d) return done({ decision: d, reason: `Regla: «${rule.pattern}»`, confident: true });
  }

  // 2. The other leg of a transfer between two own accounts of the entity.
  const leg = (ctx.otherAccounts ?? [])
    .filter((o) => o.amountCents === -line.amountCents && Math.abs(o.postedAt.getTime() - line.postedAt.getTime()) <= 3 * 86_400_000)
    .sort((a, b) => Math.abs(a.postedAt.getTime() - line.postedAt.getTime()) - Math.abs(b.postedAt.getTime() - line.postedAt.getTime()))[0];
  if (leg) {
    const sameDay = Math.abs(leg.postedAt.getTime() - line.postedAt.getTime()) <= 86_400_000;
    return done({
      decision: { type: "INTERNAL_TRANSFER" },
      reason: credit ? `Viene de ${leg.accountName}` : `Pasa a ${leg.accountName}`,
      confident: sameDay,
    });
  }

  if (!credit) {
    // 3. Bank fees and the IVA on them. Pacífico's fee lines share the Nut
    // ("nut/code") with the main debit — checked first, since the main debit's
    // description also says "Con Comisión".
    const nut = line.reference?.split("/")[0];
    if (nut && abs < 100 && ctx.siblings.some((s) => s.id !== line.id && s.amountCents < line.amountCents && s.reference?.split("/")[0] === nut)) {
      return done({ decision: { type: "EXPENSE", category: "BANK_FEES", description: "Comisión bancaria" }, reason: "Comisión de la transacción", confident: true });
    }
    // 4. SRI and IESS: they cancel what the books already owe (IVA of the
    // sales, aportes of the rol); only interest and fines are an expense.
    if (isSriDebit(text) || isIessDebit(text)) {
      const sri = isSriDebit(text);
      const due = ctx.due && ctx.due.to === (sri ? "SRI" : "IESS") ? ctx.due : null;
      if (due && due.totalCents > 0 && due.totalCents <= abs) {
        const exact = due.totalCents === abs;
        return done({
          decision: { type: "LIABILITY_PAYMENT", to: due.to, period: due.period, parts: due.parts, extraCents: abs - due.totalCents },
          reason: `${sri ? "SRI" : "IESS"} de ${due.period}${exact ? "" : " + intereses o multas"}`,
          confident: exact,
        });
      }
      if (sri) {
        return done({ decision: { type: "EXPENSE", category: "TAXES", description: "Pago al SRI" }, reason: "Débito del SRI: revisa si es IVA", confident: false });
      }
      return done({
        decision: { type: "EXPENSE", category: "PAYROLL", description: "Planilla IESS" },
        reason: ctx.hasPayroll ? "Débito del IESS sin rol que calce" : "Débito del IESS",
        confident: !ctx.hasPayroll,
      });
    }

    // 5. Net salaries: one transfer per worker, or one for the whole rol.
    const pay = ctx.payroll ?? [];
    if (pay.length) {
      const lineTokens = new Set(tokens(line.counterparty).concat(tokens(line.description)));
      const named = pay.filter((p) => p.netCents === abs && tokens(p.employeeName).filter((t) => lineTokens.has(t)).length >= 1);
      if (named.length === 1) {
        return done({ decision: { type: "PAYROLL_NET", lineIds: [named[0].id] }, reason: `Sueldo de ${named[0].employeeName} (${named[0].period})`, confident: true });
      }
      const byRun = new Map<string, PayrollCandidate[]>();
      for (const p of pay) byRun.set(p.runId, [...(byRun.get(p.runId) ?? []), p]);
      for (const lines of byRun.values()) {
        if (lines.length > 1 && lines.reduce((a, p) => a + p.netCents, 0) === abs) {
          return done({ decision: { type: "PAYROLL_NET", lineIds: lines.map((p) => p.id) }, reason: `Sueldos del rol ${lines[0].period}`, confident: false });
        }
      }
      const amount = pay.filter((p) => p.netCents === abs);
      if (amount.length === 1) {
        return done({ decision: { type: "PAYROLL_NET", lineIds: [amount[0].id] }, reason: `¿Sueldo de ${amount[0].employeeName}? (solo coincide el monto)`, confident: false });
      }
    }
    if (abs <= 500 && FEE_RE.test(text.replace(/con comision/g, ""))) {
      return done({ decision: { type: "EXPENSE", category: "BANK_FEES", description: line.description }, reason: "Comisión bancaria", confident: true });
    }
    const owner = ownerOf(`${line.counterparty ?? ""} ${line.description}`);
    if (owner) {
      return done(
        ctx.accountKind === "PERSONAL_MIXED"
          ? { decision: { type: "PERSONAL" }, reason: `Transferencia a ${owner}`, confident: false }
          : { decision: { type: "CAPITAL", kind: ctx.sede === "XTREME" ? "LOAN_REPAYMENT" : "WITHDRAWAL", person: owner }, reason: `Devolución a ${owner}`, confident: false },
      );
    }
    if (ctx.accountKind === "PERSONAL_MIXED") {
      return done({ decision: { type: "PERSONAL" }, reason: "Débito en cuenta personal", confident: false });
    }
    return done(null);
  }

  // ── Credits ──
  if (/pagoplux|\bplux\b/.test(text)) {
    // Settlements arrive net of the processor fee (~4.9 %): list nearby card
    // charges and propose the one whose fee rate is plausible (3–7 %).
    const near = (c: CandidatePayment) =>
      c.paidAt ? Math.abs(c.paidAt.getTime() - line.postedAt.getTime()) / 86_400_000 : 99;
    const cards = ctx.candidates
      .filter((c) => /CARD|PLUX/.test(c.method) && near(c) <= 10)
      .sort((a, b) => near(a) - near(b));
    const fits = cards.filter((c) => {
      const rate = 1 - line.amountCents / c.amountCents;
      return rate >= 0.03 && rate <= 0.07;
    });
    const asScored = cards.slice(0, 8).map((c) => ({ ...c, score: 0, exactAmount: false, matchedTokens: [] }));
    return {
      suggestion: {
        decision: { type: "MEMBER_PAYMENTS", paymentIds: fits[0] ? [fits[0].id] : [], commission: true },
        reason: fits[0] ? `Tarjeta de ${fits[0].memberName} (neto de comisión)` : "Liquidación de tarjeta (Pagoplux): elige los cobros",
        confident: false,
      },
      candidates: asScored,
    };
  }

  const owner = ownerOf(`${line.counterparty ?? ""} ${line.description}`);
  if (owner) {
    return done(
      ctx.accountKind === "PERSONAL_MIXED"
        ? { decision: { type: "PERSONAL" }, reason: `Transferencia de ${owner}`, confident: false }
        : { decision: { type: "CAPITAL", kind: ctx.sede === "XTREME" ? "SHAREHOLDER_LOAN" : "CONTRIBUTION", person: owner }, reason: `${owner} cubre caja`, confident: false },
    );
  }

  const [best, second] = scored;
  if (best && best.exactAmount && best.matchedTokens.length > 0) {
    const clear = best.matchedTokens.length >= 2 && (!second || second.score < best.score);
    return done({
      decision: { type: "MEMBER_PAYMENTS", paymentIds: [best.id] },
      reason: `Pago de ${best.memberName}`,
      confident: clear,
    });
  }
  const pair = findPair(line, scored);
  if (pair) {
    return done({
      decision: { type: "MEMBER_PAYMENTS", paymentIds: pair.map((p) => p.id) },
      reason: `Paga por dos: ${pair[0].memberName} y ${pair[1].memberName}`,
      confident: false,
    });
  }

  // Gatorade at reception: $1.25 each.
  if (abs % 125 === 0 && abs <= 750 && !scored.some((c) => c.exactAmount)) {
    return done({
      decision: { type: "OTHER_INCOME", category: "PRODUCT_SALE", description: `Gatorade ×${abs / 125}` },
      reason: "Múltiplo de $1.25",
      confident: abs <= 375,
    });
  }

  // Weak evidence: only the amount, or a single (often common) name token.
  if (best && (best.exactAmount || best.matchedTokens.length >= 2)) {
    const why = best.exactAmount && best.matchedTokens.length === 0 ? " (solo coincide el monto)" : "";
    return done({ decision: { type: "MEMBER_PAYMENTS", paymentIds: [best.id] }, reason: `¿Pago de ${best.memberName}?${why}`, confident: false });
  }
  return done({ decision: { type: "UNASSIGNED_DEPOSIT" }, reason: "Sin pago registrado que calce", confident: false });
}

/** Spanish label for a decision (inbox + history). */
export function decisionLabel(d: Decision): string {
  switch (d.type) {
    case "MEMBER_PAYMENTS": return d.paymentIds.length > 1 ? `Pagos de socios (${d.paymentIds.length})` : "Pago de socio";
    case "UNASSIGNED_DEPOSIT": return "Depósito sin asignar";
    case "OTHER_INCOME": return `Otro ingreso · ${d.description}`;
    case "EXPENSE": return `Gasto · ${d.description}`;
    case "CAPITAL": return `Dueños · ${d.person}`;
    case "LOAN_PAYMENT": return "Cuota de préstamo";
    case "PAYROLL_NET": return d.lineIds.length > 1 ? `Sueldos (${d.lineIds.length} personas)` : "Sueldo";
    case "LIABILITY_PAYMENT": return d.to === "IESS" ? `Planilla IESS ${d.period}` : `Pago al SRI ${d.period}`;
    case "PERSONAL": return "Personal (fuera de la contabilidad)";
    case "INTERNAL_TRANSFER": return "Transferencia entre cuentas";
    case "IGNORE": return "Ignorado";
  }
}
