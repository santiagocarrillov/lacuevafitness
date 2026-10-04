/**
 * Finanzas 1b — bank reconciliation checks.
 *  A. Parsers against the real statements in ~/Downloads (skipped if absent):
 *     the running balance must be continuous line by line.
 *  B. Suggestion engine cases (pure).
 *  C. Classify + undo against the real DB inside ONE transaction that is
 *     always rolled back — nothing is persisted.
 *
 * Uso:  npx tsx scripts/test-banco.ts
 */

import "dotenv/config";
import fs from "fs";
import { readSheet } from "read-excel-file/universal";
import { prisma } from "../src/lib/prisma";
import { parseStatement, type Cell } from "../src/lib/finance/bank-parsers";
import { suggest, type CandidatePayment, type LiabilityDue, type LineIn, type RuleIn } from "../src/lib/finance/bank-suggest";
import { classifyInTx, undoInTx } from "../src/lib/finance/bank-core";
import { desiredEntries } from "../src/lib/accounting/posting";
import { seedChart } from "../src/lib/accounting/chart";

let fallos = 0;
function check(nombre: string, ok: boolean, detalle = "") {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
async function throws(nombre: string, fn: () => Promise<unknown>, re: RegExp) {
  try {
    await fn();
    check(nombre, false, "no lanzó error");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    check(nombre, re.test(m), m);
  }
}

const DIR = `${process.env.HOME}/Downloads/LA CUEVA — SRXFIT/Documentos/Estados Banco/`;

async function partA() {
  console.log("\n── A. Parsers (archivos reales)");
  if (!fs.existsSync(DIR)) return console.log("   (sin archivos locales: se omite)");
  const expected: Record<string, string> = { Movimientos_2: "PACIFICO", Movimientos_c: "PICHINCHA", Prod: "PRODUBANCO" };
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".xlsx"))) {
    const b = fs.readFileSync(DIR + f);
    const st = parseStatement((await readSheet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)) as Cell[][]);
    const want = Object.entries(expected).find(([k]) => f.startsWith(k))?.[1];
    check(`${f}: formato ${st.format}`, !want || st.format === want);
    let jumps = 0, pairs = 0;
    for (let i = 1; i < st.lines.length; i++) {
      const a = st.lines[i - 1], c = st.lines[i];
      if (a.balanceCents == null || c.balanceCents == null) continue;
      pairs++;
      if (a.balanceCents + c.amountCents !== c.balanceCents && c.balanceCents + a.amountCents !== a.balanceCents) jumps++;
    }
    check(`${f}: saldo continuo en ${pairs} pares`, pairs > 0 && jumps === 0, `${st.lines.length} líneas, ${jumps} saltos`);
    check(`${f}: fechas válidas`, st.lines.every((l) => !isNaN(l.postedAt.getTime()) && l.postedAt.getUTCFullYear() >= 2025));
  }
}

function partB() {
  console.log("\n── B. Sugerencias");
  const t = new Date("2026-09-18T15:00:00Z");
  const L = (id: string, cents: number, description: string, counterparty: string | null = null, reference: string | null = null): LineIn =>
    ({ id, postedAt: t, amountCents: cents, description, counterparty, reference });
  const base = { sede: "XTREME" as const, accountKind: "BUSINESS" as const, rules: [] as RuleIn[], candidates: [] as CandidatePayment[], siblings: [] as LineIn[] };

  const fee = suggest(L("1", -36, "COMISION TRANSFERENCIA INTERBANCARIA ENVIADA"), base).suggestion;
  check("comisión → gasto bancario seguro", fee?.decision.type === "EXPENSE" && fee.decision.category === "BANK_FEES" && fee.confident);

  const main = L("m", -21801, "Débitos · plani Ocp105-Iess Quito", null, "0545229/2946");
  const sib = L("s", -51, "Débitos · plani Ocp105-Iess Quito", null, "0545229/3152");
  const s1 = suggest(sib, { ...base, siblings: [main, sib] }).suggestion;
  check("Pacífico: línea pequeña con el mismo Nut → comisión", s1?.decision.type === "EXPENSE" && s1.decision.category === "BANK_FEES");
  const s2 = suggest(main, { ...base, siblings: [main, sib] }).suggestion;
  check("débito IESS → sueldos", s2?.decision.type === "EXPENSE" && s2.decision.category === "PAYROLL");
  const sri = suggest(L("x", -11082, "Débitos · Srisece1 . Ocp105-Pacifico"), base).suggestion;
  check("débito SRI → impuestos", sri?.decision.type === "EXPENSE" && sri.decision.category === "TAXES");

  const gat = suggest(L("g", 250, "Transferencia Intermatico", "Sarmiento Benavides Viviana"), base).suggestion;
  check("$2.50 → Gatorade ×2", gat?.decision.type === "OTHER_INCOME" && gat.decision.description === "Gatorade ×2" && gat.confident);

  const isa = suggest(L("i", 50000, "Transferencia Recibida", "CARDENAS SALAZAR ISABEL ALEJANDRA"), base).suggestion;
  check("Isabel a Xtreme → préstamo de accionista", isa?.decision.type === "CAPITAL" && isa.decision.kind === "SHAREHOLDER_LOAN" && isa.decision.person === "Isabel Cárdenas");
  const isaP = suggest(L("i2", 50000, "TRANSF. DIRECTA DE CARDENAS SALAZAR ISABEL", "CARDENAS SALAZAR ISABEL"), { ...base, sede: "FITNESS_CENTER", accountKind: "PERSONAL_MIXED" }).suggestion;
  check("Isabel en cuenta personal → personal", isaP?.decision.type === "PERSONAL");

  const cands: CandidatePayment[] = [
    { id: "p1", amountCents: 4000, paidAt: t, memberName: "Lourdes Mosquera", depositorName: null, method: "BANK_TRANSFER" },
    { id: "p2", amountCents: 4000, paidAt: t, memberName: "Pedro Pérez", depositorName: null, method: "BANK_TRANSFER" },
    { id: "p3", amountCents: 3500, paidAt: t, memberName: "Tatiana Quinga", depositorName: "Joselyn Llumiquinga", method: "BANK_TRANSFER" },
    { id: "p4", amountCents: 4500, paidAt: t, memberName: "Emilio Aldaz", depositorName: "Joselyn Llumiquinga", method: "BANK_TRANSFER" },
  ];
  const mem = suggest(L("c", 4000, "Transferencia Recibida", "Mosquera Castro Lourdes Vanessa"), { ...base, candidates: cands }).suggestion;
  check("monto + nombre → pago de Lourdes (seguro)", mem?.decision.type === "MEMBER_PAYMENTS" && mem.decision.paymentIds.join() === "p1" && mem.confident);
  const pair = suggest(L("c2", 8000, "Transferencia Recibida", "Llumiquinga Joselyn"), { ...base, candidates: cands }).suggestion;
  check("una transferencia por dos socios", pair?.decision.type === "MEMBER_PAYMENTS" && pair.decision.paymentIds.sort().join() === "p3,p4" && !pair.confident);
  const amb = suggest(L("c3", 4000, "Transferencia Recibida", "Fulano Desconocido"), { ...base, candidates: cands }).suggestion;
  check("solo monto → no es seguro", !amb?.confident);
  const plux = suggest(L("c4", 3803, "Transferencia Recibida", "PAGOPLUX SA"), { ...base, candidates: cands }).suggestion;
  check("Pagoplux → liquidación con comisión", plux?.decision.type === "MEMBER_PAYMENTS" && plux.decision.commission === true);

  // Regression (real Pacífico export): the main debit says "Con Comisión" too.
  const iessMain = L("im", -21801, "Transacción Débitos Ocp Con Comisión · 0000000218576586 -0001plani Ocp105-Iess Quito", null, "0545229/2946");
  const iessFee = L("if", -51, "Transacción Débitos Ocp Con Comisión · 0000000218576586 -0001plani Ocp105-Iess Quito", null, "0545229/3152");
  const ri = suggest(iessMain, { ...base, siblings: [iessMain, iessFee] }).suggestion;
  check("regresión: planilla IESS de $218 NO es comisión", ri?.decision.type === "EXPENSE" && ri.decision.category === "PAYROLL", ri?.reason);
  const sriMain = L("sm", -11082, "Transacción Débitos Ocp Con Comisión · Srisece1 . Ocp105-Pacifico", null, "3938217/1992");
  const rs = suggest(sriMain, { ...base, siblings: [sriMain] }).suggestion;
  check("regresión: pago SRI de $110 NO es comisión", rs?.decision.type === "EXPENSE" && rs.decision.category === "TAXES", rs?.reason);
  const big = suggest(L("bf", -5000, "COMISION POR SERVICIO"), base).suggestion;
  check("«comisión» de $50 no se marca sola como comisión bancaria", !(big?.decision.type === "EXPENSE" && big.decision.category === "BANK_FEES"));
  const card: CandidatePayment[] = [
    { id: "k1", amountCents: 4000, paidAt: t, memberName: "Socia Tarjeta", depositorName: null, method: "PLUX_CARD" },
    { id: "k2", amountCents: 6000, paidAt: t, memberName: "Otro", depositorName: null, method: "PLUX_CARD" },
  ];
  const px = suggest(L("px", 3803, "Transferencia Recibida", "PAGOPLUX SA"), { ...base, candidates: card });
  check("Pagoplux $38.03 → cobro de tarjeta de $40", px.suggestion?.decision.type === "MEMBER_PAYMENTS" && px.suggestion.decision.paymentIds.join() === "k1" && px.candidates.length === 2);
  const weak = suggest(L("w", 1800, "Transferencia", "ANDINO EGUEZ MARIA DENISSE"), { ...base, candidates: [{ id: "q", amountCents: 4500, paidAt: t, memberName: "Maria Jose Marin", depositorName: null, method: "BANK_TRANSFER" }] }).suggestion;
  check("un solo nombre común y otro monto → no se sugiere ese pago", weak?.decision.type !== "MEMBER_PAYMENTS");

  const rule: RuleIn = { id: "r", pattern: "Perez Espinoza Carina", direction: 1, kind: "OTHER_INCOME", category: null, label: JSON.stringify({ description: "Reembolso limpieza", otherCategory: "REIMBURSEMENT" }) };
  const r1 = suggest(L("c5", 2247, "Transferencia Recibida", "PEREZ ESPINOZA CARINA VIVIANA"), { ...base, rules: [rule] }).suggestion;
  check("regla aprendida (sin tildes/mayúsculas)", r1?.decision.type === "OTHER_INCOME" && r1.decision.category === "REIMBURSEMENT" && r1.confident);
  const r2 = suggest(L("c6", -2247, "Transferencia enviada", "PEREZ ESPINOZA CARINA VIVIANA"), { ...base, rules: [rule] }).suggestion;
  check("regla de créditos no aplica a débitos", r2?.decision.type !== "OTHER_INCOME");

  // ── Caja y Bancos v2 ──
  const out = L("t1", -30000, "TRANSFERENCIA A CTA 2203483", "CARRILLO VELASTEGUI SANTIAGO");
  const tr = suggest(out, { ...base, sede: "FITNESS_CENTER", accountKind: "PERSONAL_MIXED", otherAccounts: [{ ...L("t2", 30000, "TRANSF. RECIBIDA", "CARRILLO VELASTEGUI SANTIAGO"), accountName: "Pichincha Santiago" }] }).suggestion;
  check("la otra pata en otra cuenta propia → entre cuentas (seguro)", tr?.decision.type === "INTERNAL_TRANSFER" && tr.confident, tr?.reason);
  const far = suggest(out, { ...base, otherAccounts: [{ ...L("t3", 30000, "TRANSF"), postedAt: new Date(t.getTime() + 6 * 86_400_000), accountName: "Otra" }] }).suggestion;
  check("misma cifra 6 días después no es la otra pata", far?.decision.type !== "INTERNAL_TRANSFER");

  const iessDue: LiabilityDue = { to: "IESS", period: "2026-08", parts: [{ code: "2.1.03", cents: 5856 }, { code: "2.1.04", cents: 4555 }], totalCents: 10411 };
  const iessLine = L("ie", -10411, "Débitos · plani Ocp105-Iess Quito");
  const li = suggest(iessLine, { ...base, due: iessDue, hasPayroll: true }).suggestion;
  check("IESS que calza con el rol → cancela aportes (seguro)", li?.decision.type === "LIABILITY_PAYMENT" && li.decision.to === "IESS" && li.decision.extraCents === 0 && li.confident);
  const li2 = suggest(L("ie2", -10611, "Débitos · plani Ocp105-Iess Quito"), { ...base, due: iessDue, hasPayroll: true }).suggestion;
  check("IESS con $2 de más → multa aparte, no seguro", li2?.decision.type === "LIABILITY_PAYMENT" && li2.decision.extraCents === 200 && !li2.confident);
  const li3 = suggest(iessLine, { ...base, hasPayroll: true }).suggestion;
  check("IESS sin rol que calce (con nómina en la app) → no seguro", li3?.decision.type === "EXPENSE" && !li3.confident);
  const sriDue: LiabilityDue = { to: "SRI", period: "2026-08", parts: [{ code: "2.1.06", cents: 39130 }, { code: "1.3.01", cents: -28048 }], totalCents: 11082 };
  const ls = suggest(L("sr", -11082, "Débitos · Srisece1 . Ocp105-Pacifico"), { ...base, due: sriDue }).suggestion;
  check("SRI que calza con el 104 → cancela IVA (seguro)", ls?.decision.type === "LIABILITY_PAYMENT" && ls.decision.to === "SRI" && ls.confident);
  const ls2 = suggest(L("sr2", -11082, "Débitos · Srisece1 . Ocp105-Pacifico"), { ...base, due: iessDue }).suggestion;
  check("propuesta del IESS no se usa para un débito del SRI", ls2?.decision.type === "EXPENSE" && !ls2.confident);

  const pay = [
    { id: "n1", runId: "r", period: "2026-09", employeeName: "Andrea Torres", netCents: 43645 },
    { id: "n2", runId: "r", period: "2026-09", employeeName: "Luis Mena", netCents: 43645 },
  ];
  const sal = suggest(L("sa", -43645, "TRANSFERENCIA A TORRES ANDREA"), { ...base, payroll: pay }).suggestion;
  check("sueldo por monto y nombre → esa persona (seguro)", sal?.decision.type === "PAYROLL_NET" && sal.decision.lineIds.join() === "n1" && sal.confident);
  const all = suggest(L("sb", -87290, "PAGO NOMINA"), { ...base, payroll: pay }).suggestion;
  check("un débito por todo el rol → todos los sueldos", all?.decision.type === "PAYROLL_NET" && all.decision.lineIds.length === 2 && !all.confident);
  const amb2 = suggest(L("sc", -43645, "TRANSFERENCIA"), { ...base, payroll: pay }).suggestion;
  check("dos sueldos iguales sin nombre → no adivina", amb2?.decision.type !== "PAYROLL_NET");
}

class Rollback extends Error {}

async function partC() {
  console.log("\n── C. Clasificar y deshacer (transacción revertida)");
  const realPending = await prisma.payment.findFirst({
    where: { sede: "XTREME", status: "PENDING", isPoolEntry: false, memberId: { not: null }, bankTransactionId: null },
    orderBy: { paidAt: "desc" },
  });
  const before = await prisma.bankAccount.count();

  try {
    await prisma.$transaction(async (tx) => {
      const acct = await tx.bankAccount.create({
        data: { sede: "XTREME", name: "TEST rollback", bank: "Banco del Pacífico", statementFormat: "PACIFICO" },
      });
      let n = 0;
      const mk = (amountCents: number, description: string, counterparty: string | null = null) =>
        tx.bankTransaction.create({
          data: { accountId: acct.id, postedAt: new Date("2026-09-20T15:00:00Z"), amountCents, description, counterparty, reference: `T${++n}`, fingerprint: `test-${Date.now()}-${n}` },
        });
      const uid = "test-user";

      // Expense, then undo.
      const fee = await mk(-51, "Comisión");
      await classifyInTx(tx, uid, fee.id, { type: "EXPENSE", category: "BANK_FEES", description: "Comisión" }, { pattern: "Comisión test" });
      const e = await tx.expense.findFirst({ where: { bankTransactionId: fee.id } });
      check("gasto creado y enlazado", e?.amountCents === 51 && e.sede === "XTREME" && e.status === "PAID");
      check("regla guardada", (await tx.bankRule.count({ where: { pattern: "Comisión test" } })) === 1);
      await throws("no se clasifica dos veces", () => classifyInTx(tx, uid, fee.id, { type: "IGNORE" }), /ya fue clasificado/);
      await undoInTx(tx, fee.id);
      const e2 = await tx.expense.findUnique({ where: { id: e!.id } });
      const fee2 = await tx.bankTransaction.findUnique({ where: { id: fee.id } });
      check("deshacer: gasto anulado y línea pendiente", !!e2?.voidedAt && !e2.bankTransactionId && fee2?.status === "PENDING" && fee2.appliedJson === null);

      // Other income.
      const g = await mk(250, "Gatorade");
      await classifyInTx(tx, uid, g.id, { type: "OTHER_INCOME", category: "PRODUCT_SALE", description: "Gatorade ×2" });
      const o = await tx.otherIncome.findFirst({ where: { bankTransactionId: g.id } });
      check("otro ingreso creado", o?.amountCents === 250 && o.category === "PRODUCT_SALE");
      await undoInTx(tx, g.id);
      check("deshacer: otro ingreso anulado", !!(await tx.otherIncome.findUnique({ where: { id: o!.id } }))?.voidedAt);

      // Unassigned deposit → pool entry; undo marks it FAILED (never DELETE).
      const dep = await mk(4000, "Transferencia", "Alguien Sin Registro");
      await classifyInTx(tx, uid, dep.id, { type: "UNASSIGNED_DEPOSIT" });
      const pool = await tx.payment.findFirst({ where: { bankTransactionId: dep.id } });
      check("depósito sin asignar → Pagos › Sin asignar", pool?.isPoolEntry === true && pool.status === "PENDING" && pool.depositorName === "Alguien Sin Registro");
      await undoInTx(tx, dep.id);
      check("deshacer: depósito queda FAILED", (await tx.payment.findUnique({ where: { id: pool!.id } }))?.status === "FAILED");

      // Validation.
      const cap = await mk(10000, "Transferencia", "CARDENAS SALAZAR ISABEL");
      await throws("crédito no puede ser retiro", () => classifyInTx(tx, uid, cap.id, { type: "CAPITAL", kind: "WITHDRAWAL", person: "Isabel Cárdenas" }), /débito/);
      const out = await mk(-10000, "Transferencia a", "CARDENAS SALAZAR ISABEL");
      await throws("S.A.S. no admite retiro", () => classifyInTx(tx, uid, out.id, { type: "CAPITAL", kind: "WITHDRAWAL", person: "Isabel Cárdenas" }), /S\.A\.S\./);
      await classifyInTx(tx, uid, cap.id, { type: "CAPITAL", kind: "SHAREHOLDER_LOAN", person: "Isabel Cárdenas" });
      check("préstamo de Isabel registrado", (await tx.capitalMovement.findFirst({ where: { bankTransactionId: cap.id } }))?.kind === "SHAREHOLDER_LOAN");

      // Real member payment: confirm, then undo restores it exactly.
      if (realPending) {
        const credit = await mk(realPending.amountCents, "Transferencia", "Socio");
        await throws(
          "monto distinto sin comisión → error",
          async () => {
            const wrong = await mk(realPending.amountCents + 100, "Transferencia");
            await classifyInTx(tx, uid, wrong.id, { type: "MEMBER_PAYMENTS", paymentIds: [realPending.id] });
          },
          /suman/,
        );
        await classifyInTx(tx, uid, credit.id, { type: "MEMBER_PAYMENTS", paymentIds: [realPending.id] });
        const p1 = await tx.payment.findUnique({ where: { id: realPending.id } });
        check("pago real confirmado y conciliado", p1?.status === "SUCCEEDED" && !!p1.reconciledAt && p1.bankTransactionId === credit.id);
        await undoInTx(tx, credit.id);
        const p2 = await tx.payment.findUnique({ where: { id: realPending.id } });
        check(
          "deshacer: pago vuelve exactamente a como estaba",
          p2?.status === realPending.status && p2.reconciledAt?.getTime() === realPending.reconciledAt?.getTime() &&
            p2.bankReference === realPending.bankReference && p2.bankEntity === realPending.bankEntity && p2.bankTransactionId === null,
        );

        // Card settlement: net deposit, difference booked as fee.
        const net = await mk(realPending.amountCents - 197, "PAGOPLUX SA");
        await classifyInTx(tx, uid, net.id, { type: "MEMBER_PAYMENTS", paymentIds: [realPending.id], commission: true });
        const fee3 = await tx.expense.findFirst({ where: { bankTransactionId: net.id } });
        check("liquidación de tarjeta → comisión $1.97", fee3?.amountCents === 197 && fee3.category === "BANK_FEES");
      } else {
        console.log("   (no hay pagos PENDING de Xtreme: se omite el caso con pago real)");
      }

      // ── Caja y Bancos v2: entries against the real Pacífico ledger account.
      await seedChart(tx, "XTREME"); // 1.1.07 may not exist yet in this DB
      const pac = await tx.bankAccount.findFirst({ where: { sede: "XTREME", active: true, ledgerAccounts: { some: {} } }, include: { ledgerAccounts: true } });
      if (!pac) {
        console.log("   (Xtreme no tiene cuenta bancaria enlazada al plan: se omiten los asientos)");
      } else {
        const bankId = pac.ledgerAccounts[0].id;
        const day = new Date("2026-09-20T00:00:00.000Z");
        const mkP = (amountCents: number, description: string) =>
          tx.bankTransaction.create({
            data: { accountId: pac.id, postedAt: new Date("2026-09-20T15:00:00Z"), amountCents, description, reference: `P${++n}`, fingerprint: `test-${Date.now()}-p${n}` },
          });
        const entriesFor = async (pred: (e: { source: string; sourceId: string }) => boolean) =>
          (await desiredEntries(tx, "XTREME", day, day)).filter((e) => pred(e));
        const codeOf = async (id: string) => (await tx.ledgerAccount.findUnique({ where: { id } }))?.code;

        // Transfer between own accounts → bank vs 1.1.07.
        const trf = await mkP(-20000, "Transferencia a cuenta propia");
        await classifyInTx(tx, uid, trf.id, { type: "INTERNAL_TRANSFER" });
        const [te] = await entriesFor((e) => e.source === "BANK" && e.sourceId === trf.id);
        const teCodes = te ? await Promise.all(te.lines.map((l) => codeOf(l.accountId))) : [];
        check("transferencia: Dr 1.1.07 · Cr banco", !!te && teCodes.includes("1.1.07") && te.lines.some((l) => l.accountId === bankId && l.creditCents === 20000));

        // Loan instalment: principal needs its liability.
        const loan = await mkP(-50000, "Cuota préstamo");
        await throws("cuota sin cuenta del préstamo → error", () => classifyInTx(tx, uid, loan.id, { type: "LOAN_PAYMENT", interestCents: 5000 }), /préstamo/);
        await classifyInTx(tx, uid, loan.id, { type: "LOAN_PAYMENT", interestCents: 5000, principalCode: "2.2.02" });
        const [le] = await entriesFor((e) => e.source === "BANK" && e.sourceId === loan.id);
        check("cuota: capital $450 contra 2.2.02", !!le && le.lines.some((l) => l.debitCents === 45000) && le.lines.some((l) => l.accountId === bankId && l.creditCents === 45000));
        check("cuota: interés $50 como gasto enlazado", (await tx.expense.findFirst({ where: { bankTransactionId: loan.id } }))?.amountCents === 5000);

        // IESS planilla: cancels the aportes, fines as expense.
        const iess = await mkP(-10611, "plani Ocp105-Iess Quito");
        await throws(
          "IESS: desglose que no suma → error",
          () => classifyInTx(tx, uid, iess.id, { type: "LIABILITY_PAYMENT", to: "IESS", period: "2026-08", parts: [{ code: "2.1.03", cents: 5856 }], extraCents: 0 }),
          /suma/,
        );
        await throws(
          "IESS: cuenta del SRI no se paga al IESS",
          () => classifyInTx(tx, uid, iess.id, { type: "LIABILITY_PAYMENT", to: "IESS", period: "2026-08", parts: [{ code: "2.1.06", cents: 10611 }], extraCents: 0 }),
          /no se paga/,
        );
        await classifyInTx(tx, uid, iess.id, { type: "LIABILITY_PAYMENT", to: "IESS", period: "2026-08", parts: [{ code: "2.1.03", cents: 5856 }, { code: "2.1.04", cents: 4555 }], extraCents: 200 });
        const [ie] = await entriesFor((e) => e.source === "BANK" && e.sourceId === iess.id);
        const ieCodes = ie ? await Promise.all(ie.lines.map((l) => codeOf(l.accountId))) : [];
        check("IESS: Dr 2.1.03 + 2.1.04 · Cr banco $104.11", !!ie && ieCodes.includes("2.1.03") && ieCodes.includes("2.1.04") && ie.lines.some((l) => l.accountId === bankId && l.creditCents === 10411));
        check("IESS: multa $2 como gasto", (await tx.expense.findFirst({ where: { bankTransactionId: iess.id } }))?.amountCents === 200);
        check("IESS: el movimiento queda como Sueldos e IESS", (await tx.bankTransaction.findUnique({ where: { id: iess.id } }))?.kind === "PAYROLL");

        // SRI: IVA of sales less the credit applied.
        const sri = await mkP(-11082, "Srisece1 . Ocp105-Pacifico");
        await classifyInTx(tx, uid, sri.id, { type: "LIABILITY_PAYMENT", to: "SRI", period: "2026-08", parts: [{ code: "2.1.06", cents: 39130 }, { code: "1.3.01", cents: -28048 }], extraCents: 0 });
        const [se] = await entriesFor((e) => e.source === "BANK" && e.sourceId === sri.id);
        const credit1301 = se ? (await Promise.all(se.lines.map(async (l) => ((await codeOf(l.accountId)) === "1.3.01" ? l.creditCents ?? 0 : 0)))).reduce((a, b) => a + b, 0) : 0;
        check("SRI: Dr 2.1.06 $391.30 · Cr 1.3.01 $280.48 · Cr banco $110.82", !!se && credit1301 === 28048 && se.lines.some((l) => l.accountId === bankId && l.creditCents === 11082));

        // Net salaries: link the rol lines, the rol becomes paid; undo restores it.
        const emp = await tx.employee.create({ data: { sede: "XTREME", firstName: "Test", lastName: "Rollback", startDate: new Date("2026-01-01") } });
        const emp2 = await tx.employee.create({ data: { sede: "XTREME", firstName: "Otra", lastName: "Persona", startDate: new Date("2026-01-01") } });
        const run = await tx.payrollRun.create({ data: { sede: "XTREME", period: "2099-09", status: "APPROVED", approvedAt: new Date() } });
        const l1 = await tx.payrollLine.create({ data: { runId: run.id, employeeId: emp.id, netCents: 43645, grossCents: 48200 } });
        const l2 = await tx.payrollLine.create({ data: { runId: run.id, employeeId: emp2.id, netCents: 30000, grossCents: 33000 } });
        const s1 = await mkP(-43645, "Transferencia a Test Rollback");
        await throws("sueldo que no suma → error", () => classifyInTx(tx, uid, s1.id, { type: "PAYROLL_NET", lineIds: [l1.id, l2.id] }), /suman/);
        await classifyInTx(tx, uid, s1.id, { type: "PAYROLL_NET", lineIds: [l1.id] });
        check("primer sueldo enlazado; el rol sigue aprobado", (await tx.payrollLine.findUnique({ where: { id: l1.id } }))?.bankTransactionId === s1.id && (await tx.payrollRun.findUnique({ where: { id: run.id } }))?.status === "APPROVED");
        const s2 = await mkP(-30000, "Transferencia a Otra Persona");
        await classifyInTx(tx, uid, s2.id, { type: "PAYROLL_NET", lineIds: [l2.id] });
        const paidRun = await tx.payrollRun.findUnique({ where: { id: run.id } });
        check("todos los sueldos enlazados → rol pagado por transferencia", paidRun?.status === "PAID" && paidRun.paidMethod === "BANK_TRANSFER");
        const [pe] = await entriesFor((e) => e.source === "PAYROLL" && e.sourceId === `${run.id}:banco:${s1.id}`);
        check("asiento del sueldo: Dr 2.1.08 · Cr banco", !!pe && pe.lines.some((l) => l.accountId === bankId && l.creditCents === 43645));
        check("sin asiento duplicado contra la cuenta puente", (await entriesFor((e) => e.sourceId === `${run.id}:pago`)).length === 0);
        await throws("no se enlaza dos veces el mismo sueldo", async () => {
          const s3 = await mkP(-30000, "Otra vez");
          await classifyInTx(tx, uid, s3.id, { type: "PAYROLL_NET", lineIds: [l2.id] });
        }, /ya está enlazado/);
        await undoInTx(tx, s2.id);
        const back = await tx.payrollRun.findUnique({ where: { id: run.id } });
        check("deshacer: el rol vuelve a aprobado y el sueldo queda libre", back?.status === "APPROVED" && back.paidAt === null && (await tx.payrollLine.findUnique({ where: { id: l2.id } }))?.bankTransactionId === null);
      }

      throw new Rollback("fin de la prueba");
    }, { timeout: 60_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  check("nada quedó en la base (rollback)", (await prisma.bankAccount.count()) === before);
  if (realPending) {
    const after = await prisma.payment.findUnique({ where: { id: realPending.id } });
    check("el pago real sigue intacto", after?.status === realPending.status && after.bankTransactionId === null);
  }
}

async function main() {
  await partA();
  partB();
  await partC();
  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodo OK");
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main();
