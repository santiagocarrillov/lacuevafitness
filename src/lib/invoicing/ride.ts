// RIDE: printable representation of an electronic invoice (PDF, server only).
// pdf-lib with the standard Helvetica fonts (WinAnsi) — no font files needed on
// Vercel. The access key is drawn as a Code 128 barcode (set C).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ENTITIES } from "@/lib/finance/entities";
import { PAY_FORM_LABELS, formatDocNumber, lineAmounts } from "@/lib/invoicing/core";
import type { Sede, SriEnvironment } from "@/generated/prisma/enums";

// ── Code 128 ────────────────────────────────────────────────────────────────

/** Bar/space widths for values 0–106 (106 = stop). */
export const CODE128 = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

/** Code values for a digit string: start C, digit pairs, code B for an odd tail, checksum, stop. */
export function code128Digits(digits: string): number[] {
  if (!/^\d+$/.test(digits)) throw new Error("Code 128 C: solo dígitos.");
  const vals = [105];
  let i = 0;
  for (; i + 1 < digits.length; i += 2) vals.push(Number(digits.slice(i, i + 2)));
  if (i < digits.length) vals.push(100, digits.charCodeAt(i) - 32); // switch to B
  const check = vals.reduce((a, v, k) => a + v * (k === 0 ? 1 : k), 0) % 103;
  return [...vals, check, 106];
}

function drawBarcode(page: PDFPage, digits: string, x: number, y: number, width: number, height: number) {
  const modules = code128Digits(digits).flatMap((v) => CODE128[v].split("").map(Number));
  const total = modules.reduce((a, b) => a + b, 0);
  const unit = width / total;
  let cx = x;
  modules.forEach((w, k) => {
    if (k % 2 === 0) page.drawRectangle({ x: cx, y, width: w * unit, height, color: rgb(0, 0, 0) });
    cx += w * unit;
  });
}

// ── Layout helpers ──────────────────────────────────────────────────────────

/** Keeps characters Helvetica (WinAnsi) can print. */
const pdfText = (v: string) =>
  v
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfText(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

const usd = (c: number) => (c / 100).toFixed(2);

export type RideInput = {
  sede: Sede;
  environment: SriEnvironment;
  establishment: string;
  point: string;
  establishmentAddress: string;
  sequential: number;
  accessKey: string;
  authorizationNumber: string | null;
  authorizedAt: Date | null;
  issueDate: Date;
  buyerIdType: string;
  buyerId: string;
  buyerName: string;
  buyerAddress: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  payForm: string;
  totalCents: number;
  ivaCents: number;
  lines: { code: string; description: string; quantity: number; unitPriceCents: number; discountCents: number; ivaRate: number }[];
};

export async function renderRide(r: RideInput): Promise<Uint8Array> {
  const e = ENTITIES[r.sede];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Factura ${formatDocNumber(r.establishment, r.point, r.sequential)}`);
  pdf.setAuthor(e.legalName);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595.28, 841.89]); // A4
  const M = 36;
  const W = 595.28 - 2 * M;
  const gray = rgb(0.45, 0.45, 0.45);
  const text = (t: string, x: number, y: number, size = 8, f = font, color = rgb(0, 0, 0)) =>
    page.drawText(pdfText(t), { x, y, size, font: f, color });
  const box = (x: number, y: number, w: number, h: number) =>
    page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.7 });

  // Header: issuer (left) and document box (right).
  const top = 841.89 - M;
  const rightW = 270;
  const leftW = W - rightW - 10;
  const headH = 190;
  box(M, top - headH, leftW, headH);
  box(M + leftW + 10, top - headH, rightW, headH);

  let y = top - 30;
  for (const l of wrap(e.tradeName.toUpperCase(), bold, 14, leftW - 20)) {
    text(l, M + 10, y, 14, bold);
    y -= 18;
  }
  y -= 6;
  for (const [label, value] of [
    ["", e.legalName],
    ["Dir. matriz:", e.matrixAddress ?? r.establishmentAddress],
    ["Dir. sucursal:", r.establishmentAddress],
    ["Obligado a llevar contabilidad:", e.accountingRequired ? "SÍ" : "NO"],
  ]) {
    const lines = wrap(`${label} ${value}`.trim(), font, 8, leftW - 20);
    for (const l of lines) {
      text(l, M + 10, y, 8);
      y -= 11;
    }
    y -= 3;
  }

  const rx = M + leftW + 20;
  y = top - 20;
  text(`R.U.C.: ${e.ruc}`, rx, y, 10, bold);
  y -= 18;
  text("FACTURA", rx, y, 14, bold);
  y -= 16;
  text(`No. ${formatDocNumber(r.establishment, r.point, r.sequential)}`, rx, y, 10);
  y -= 16;
  text("NÚMERO DE AUTORIZACIÓN", rx, y, 7, bold);
  y -= 10;
  text(r.authorizationNumber ?? "— pendiente —", rx, y, 6.5);
  y -= 13;
  text(`FECHA Y HORA DE AUTORIZACIÓN: ${r.authorizedAt ? r.authorizedAt.toLocaleString("es-EC", { timeZone: "America/Guayaquil" }) : "—"}`, rx, y, 7);
  y -= 12;
  text(`AMBIENTE: ${r.environment === "PRUEBAS" ? "PRUEBAS" : "PRODUCCIÓN"}`, rx, y, 7);
  y -= 11;
  text("EMISIÓN: NORMAL", rx, y, 7);
  y -= 14;
  text("CLAVE DE ACCESO", rx, y, 7, bold);
  y -= 40;
  drawBarcode(page, r.accessKey, rx, y, rightW - 20, 34);
  y -= 10;
  text(r.accessKey, rx, y, 6.5);

  // Buyer
  y = top - headH - 10;
  const buyerH = 48;
  box(M, y - buyerH, W, buyerH);
  const idLabel = { "04": "RUC", "05": "Cédula", "06": "Pasaporte", "07": "Identificación" }[r.buyerIdType] ?? "Identificación";
  text(`Razón social / Nombres: ${r.buyerName}`, M + 10, y - 14, 8);
  text(`${idLabel}: ${r.buyerId}`, M + 10 + W * 0.62, y - 14, 8);
  const d = r.issueDate;
  text(`Fecha de emisión: ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`, M + 10, y - 28, 8);
  if (r.buyerAddress) text(`Dirección: ${wrap(r.buyerAddress, font, 8, W * 0.55)[0]}`, M + 10 + W * 0.38, y - 28, 8);

  // Detail table
  y = y - buyerH - 12;
  const cols = [
    { h: "Cód. principal", w: 70, align: "l" as const },
    { h: "Cant.", w: 40, align: "r" as const },
    { h: "Descripción", w: W - 70 - 40 - 75 - 60 - 75, align: "l" as const },
    { h: "Precio unitario", w: 75, align: "r" as const },
    { h: "Descuento", w: 60, align: "r" as const },
    { h: "Precio total", w: 75, align: "r" as const },
  ];
  const rowH = 14;
  page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: rgb(0.93, 0.93, 0.93) });
  let cx = M;
  for (const c of cols) {
    const tw = bold.widthOfTextAtSize(c.h, 7);
    text(c.h, c.align === "r" ? cx + c.w - tw - 4 : cx + 4, y - 10, 7, bold);
    cx += c.w;
  }
  y -= rowH;
  let subtotal15 = 0, subtotal0 = 0, discount = 0;
  for (const l of r.lines) {
    const a = lineAmounts(l);
    if (l.ivaRate > 0) subtotal15 += a.subtotalCents;
    else subtotal0 += a.subtotalCents;
    discount += a.netDiscountCents;
    const desc = wrap(l.description, font, 7.5, cols[2].w - 8);
    const h = Math.max(rowH, desc.length * 10 + 4);
    const cells = [l.code, String(l.quantity), "", Number(a.netUnitPrice).toFixed(2), usd(a.netDiscountCents), usd(a.subtotalCents)];
    cx = M;
    cols.forEach((c, k) => {
      if (k === 2) desc.forEach((dl, j) => text(dl, cx + 4, y - 10 - j * 10, 7.5));
      else {
        const tw = font.widthOfTextAtSize(cells[k], 7.5);
        text(cells[k], c.align === "r" ? cx + c.w - tw - 4 : cx + 4, y - 10, 7.5);
      }
      cx += c.w;
    });
    page.drawLine({ start: { x: M, y: y - h }, end: { x: M + W, y: y - h }, thickness: 0.4, color: rgb(0.8, 0.8, 0.8) });
    y -= h;
  }

  // Additional info + payment (left), totals (right)
  y -= 12;
  const totW = 220;
  const infoW = W - totW - 10;
  const rows: [string, number][] = [
    ["SUBTOTAL 15%", subtotal15],
    ["SUBTOTAL 0%", subtotal0],
    ["SUBTOTAL SIN IMPUESTOS", subtotal15 + subtotal0],
    ["TOTAL DESCUENTO", discount],
    ["IVA 15%", r.ivaCents],
    ["PROPINA", 0],
    ["VALOR TOTAL", r.totalCents],
  ];
  const totH = rows.length * 13 + 6;
  box(M + infoW + 10, y - totH, totW, totH);
  rows.forEach(([label, v], k) => {
    const yy = y - 13 - k * 13;
    const f = label === "VALOR TOTAL" ? bold : font;
    text(label, M + infoW + 18, yy, 7.5, f);
    const s = usd(v);
    text(s, M + infoW + 10 + totW - 8 - f.widthOfTextAtSize(s, 7.5), yy, 7.5, f);
  });

  const extra = [r.buyerEmail ? `Email: ${r.buyerEmail}` : "", r.buyerPhone ? `Teléfono: ${r.buyerPhone}` : ""].filter(Boolean);
  const infoH = 30 + extra.length * 11 + 34;
  box(M, y - infoH, infoW, infoH);
  let iy = y - 13;
  text("Información adicional", M + 8, iy, 8, bold);
  iy -= 12;
  for (const x of extra) {
    text(x, M + 8, iy, 7.5);
    iy -= 11;
  }
  iy -= 6;
  text("Forma de pago", M + 8, iy, 8, bold);
  iy -= 12;
  text(`${r.payForm} - ${PAY_FORM_LABELS[r.payForm] ?? ""}`, M + 8, iy, 7.5);
  const tv = usd(r.totalCents);
  text(tv, M + infoW - 8 - font.widthOfTextAtSize(tv, 7.5), iy, 7.5);

  if (r.environment === "PRUEBAS") {
    text("DOCUMENTO DE PRUEBAS - SIN VALIDEZ TRIBUTARIA", M, M - 10, 9, bold, gray);
  }
  return pdf.save();
}
