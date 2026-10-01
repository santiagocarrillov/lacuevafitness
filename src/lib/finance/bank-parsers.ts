// Bank statement parsers (pure — no DB). Input: rows as read by
// `read-excel-file` (every cell a string or null). Output: normalized lines.
// Formats verified against real exports (sep 2026):
//   PACIFICO   — Banco del Pacífico (Xtreme): Movimientos_*.xlsx, one row per line,
//                TipoMov N/C (credit) · N/D (debit); a transfer and its fee + fee IVA
//                share the same Nut.
//   PICHINCHA  — "Movimientos de Cuenta": two rows per line (document number and
//                beneficiary on the second row); amounts like "-$1.500,00".
//   PRODUBANCO — header block (CLIENTE, CUENTA…) then FECHA/REFERENCIA/DESCRIPCION/+/-.

import type { BankStatementFormat } from "@/generated/prisma/enums";

export type Cell = string | number | boolean | Date | null | undefined;

export type ParsedLine = {
  postedAt: Date; // UTC instant (bank times are Ecuador local, UTC−5)
  amountCents: number; // + credit, − debit
  description: string;
  counterparty: string | null;
  reference: string | null;
  balanceCents: number | null;
};

export type ParsedStatement = {
  format: BankStatementFormat;
  /** Account number printed in the file, when the format includes it. */
  accountNumber: string | null;
  lines: ParsedLine[];
};

const txt = (c: Cell) => (c === null || c === undefined ? "" : String(c).trim());
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Ecuador local wall time → UTC instant. */
function ecuadorToUtc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0) {
  return new Date(Date.UTC(y, mo - 1, d, h + 5, mi, s));
}

function to24h(h: number, ampm: string) {
  const pm = ampm.toUpperCase() === "PM";
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

/** "1,234.56" / "218.01" (dot decimal) → cents. */
function dotMoney(s: string): number {
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Monto inválido: "${s}"`);
  return Math.round(n * 100);
}

/** "-$1.500,00" / "$2,00" / "-$5,7" (comma decimal) → signed cents. */
function commaMoney(s: string): number {
  const neg = s.includes("-");
  const n = Number(s.replace(/[-$\s]/g, "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`Monto inválido: "${s}"`);
  return Math.round(n * 100) * (neg ? -1 : 1);
}

function findRow(rows: Cell[][], pred: (r: string[]) => boolean, limit = 30) {
  for (let i = 0; i < Math.min(rows.length, limit); i++) {
    if (pred(rows[i].map(txt))) return i;
  }
  return -1;
}

export function detectFormat(rows: Cell[][]): BankStatementFormat | null {
  if (findRow(rows, (r) => r.includes("TipoMov") && r.includes("Nut")) >= 0) return "PACIFICO";
  if (findRow(rows, (r) => r.includes("Nro. Documento") && r.includes("Monto")) >= 0) return "PICHINCHA";
  if (findRow(rows, (r) => r.includes("+/-") && r.includes("REFERENCIA")) >= 0) return "PRODUBANCO";
  return null;
}

// ── Banco del Pacífico ──────────────────────────────────────────────────────

function parsePacifico(rows: Cell[][]): ParsedStatement {
  const h = findRow(rows, (r) => r.includes("TipoMov") && r.includes("Nut"));
  const head = rows[h].map(txt);
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`Falta la columna "${name}" en el archivo del Pacífico.`);
    return i;
  };
  const c = {
    tipo: col("TipoMov"), nut: col("Nut"), valor: col("Valor"), numero: col("Numero"),
    concepto: col("Concepto"), saldo: col("SaldoDespMov"), desc: col("Descripcion"),
    fechaReal: col("FechaReal"), fecha: col("FechaContable"),
  };
  const ordenante = head.indexOf("NombreOrdenante");

  const lines: ParsedLine[] = [];
  for (const row of rows.slice(h + 1)) {
    const tipo = txt(row[c.tipo]);
    if (tipo !== "N/C" && tipo !== "N/D") continue;
    const when = txt(row[c.fechaReal]) || txt(row[c.fecha]);
    const m = when.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) throw new Error(`Fecha inválida en el Pacífico: "${when}"`);
    const amount = dotMoney(txt(row[c.valor]));
    const concepto = squash(txt(row[c.concepto]));
    const name = ordenante >= 0 ? squash(txt(row[ordenante])) : "";
    lines.push({
      postedAt: ecuadorToUtc(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)),
      amountCents: tipo === "N/C" ? amount : -amount,
      description: squash(`${txt(row[c.desc])} · ${concepto}`),
      counterparty: name || concepto || null,
      // Nut groups a transfer with its fee lines; Numero is the line type code.
      reference: `${txt(row[c.nut])}/${txt(row[c.numero])}`,
      balanceCents: txt(row[c.saldo]) ? dotMoney(txt(row[c.saldo])) : null,
    });
  }
  return { format: "PACIFICO", accountNumber: null, lines };
}

// ── Banco Pichincha ─────────────────────────────────────────────────────────

/** "TRANSF. DIRECTA DE KARLA MARIA…" → "KARLA MARIA…" */
export function pichinchaCounterparty(concept: string): string | null {
  const m = concept.match(/\b(?:DE|A)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{3,})$/i);
  if (!m || /^TRANSF|^TRANSFERENCIA/i.test(m[1])) return null;
  return squash(m[1]);
}

function parsePichincha(rows: Cell[][]): ParsedStatement {
  const h = findRow(rows, (r) => r.includes("Nro. Documento") && r.includes("Monto"));
  const head = rows[h].map(txt);
  const at = (name: string) => head.indexOf(name);
  const c = { fecha: at("Fecha"), concepto: at("Concepto"), tipo: at("Tipo"), monto: at("Monto"), saldo: at("Saldo"), benef: at("Beneficiario") };
  if (Object.values(c).some((i) => i < 0)) throw new Error("Encabezados de Pichincha incompletos.");

  const lines: ParsedLine[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const row = rows[i];
    const fecha = txt(row[c.fecha]);
    const m = fecha.match(/^(\d{4})-(\d{1,2})-(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) continue;
    // Second row carries the document number (any non-empty cell) and beneficiary.
    const next = (rows[i + 1] ?? []).map(txt);
    const nextIsDetail = next.length > 0 && !next[c.fecha];
    const doc = nextIsDetail ? next.find((v, j) => v && j !== c.benef) ?? null : null;
    const benef = nextIsDetail ? next[c.benef] || null : null;
    const concept = squash(txt(row[c.concepto]));
    lines.push({
      postedAt: ecuadorToUtc(+m[1], +m[2], +m[3], to24h(+m[4], m[6]), +m[5]),
      amountCents: commaMoney(txt(row[c.monto])),
      description: concept,
      counterparty: pichinchaCounterparty(concept) ?? (benef ? `Cuenta ${benef}` : null),
      reference: doc,
      balanceCents: txt(row[c.saldo]) ? commaMoney(txt(row[c.saldo])) : null,
    });
  }
  return { format: "PICHINCHA", accountNumber: null, lines };
}

// ── Produbanco ──────────────────────────────────────────────────────────────

function parseProdubanco(rows: Cell[][]): ParsedStatement {
  const acc = findRow(rows, (r) => r[0] === "CUENTA:");
  const accountNumber = acc >= 0 ? txt(rows[acc][1]) || null : null;
  const h = findRow(rows, (r) => r.includes("+/-") && r.includes("REFERENCIA"));
  const head = rows[h].map(txt);
  const c = { fecha: head.indexOf("FECHA"), ref: head.indexOf("REFERENCIA"), desc: head.indexOf("DESCRIPCION"), sign: head.indexOf("+/-"), valor: head.indexOf("VALOR"), saldo: head.indexOf("SALDO CONTABLE") };
  if (Object.values(c).some((i) => i < 0)) throw new Error("Encabezados de Produbanco incompletos.");

  const lines: ParsedLine[] = [];
  for (const row of rows.slice(h + 1)) {
    const fecha = txt(row[c.fecha]);
    const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) continue;
    const sign = txt(row[c.sign]);
    const amount = dotMoney(txt(row[c.valor]));
    // "290625020900-Suplementos": transfer number + the note typed by the sender.
    // A purely numeric suffix is part of the reference (card purchases).
    const rawRef = txt(row[c.ref]);
    const [ref, ...rest] = rawRef.split("-");
    const note = squash(rest.join("-"));
    const isNote = !!note && !/^\d+$/.test(note);
    lines.push({
      postedAt: ecuadorToUtc(+m[3], +m[1], +m[2], to24h(+m[4], m[7]), +m[5], +m[6]),
      amountCents: sign === "-" ? -amount : amount,
      description: squash(txt(row[c.desc])),
      counterparty: isNote ? note : null,
      reference: (isNote ? ref : rawRef) || null,
      balanceCents: txt(row[c.saldo]) ? dotMoney(txt(row[c.saldo])) : null,
    });
  }
  return { format: "PRODUBANCO", accountNumber, lines };
}

export function parseStatement(rows: Cell[][]): ParsedStatement {
  const format = detectFormat(rows);
  if (format === "PACIFICO") return parsePacifico(rows);
  if (format === "PICHINCHA") return parsePichincha(rows);
  if (format === "PRODUBANCO") return parseProdubanco(rows);
  throw new Error("No reconozco el formato. Sube el Excel tal como lo descarga el banco (Pacífico, Pichincha o Produbanco).");
}

export const FORMAT_LABELS: Record<BankStatementFormat, string> = {
  PACIFICO: "Banco del Pacífico",
  PICHINCHA: "Banco Pichincha",
  PRODUBANCO: "Produbanco",
};
