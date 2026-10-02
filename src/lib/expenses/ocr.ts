// Reads a purchase receipt (photo or PDF) with Claude and returns the fields
// the expense form needs. Server only. The user always reviews before saving.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const MODEL = process.env.RECEIPT_MODEL ?? "claude-opus-5-5";

export type ReceiptAccount = { code: string; name: string };

function schema(codes: [string, ...string[]]) {
  return z.object({
    readable: z.boolean().describe("false if the image is not a purchase receipt or is unreadable"),
    supplierName: z.string().nullable(),
    supplierRuc: z.string().nullable().describe("13-digit RUC or 10-digit cédula of the SELLER, digits only"),
    buyerId: z.string().nullable().describe("RUC/cédula of the BUYER printed on the document, digits only"),
    documentType: z.enum(["FACTURA", "NOTA_VENTA", "LIQUIDACION_COMPRA", "RECIBO", "SIN_DOCUMENTO"]),
    documentNumber: z.string().nullable().describe("as 001-001-000000123"),
    accessKey: z.string().nullable().describe("49-digit clave de acceso / número de autorización, digits only"),
    issueDate: z.string().nullable().describe("YYYY-MM-DD"),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "BANK_DEBIT", "DEBIT_CARD", "CREDIT_CARD", "OTHER"]).nullable(),
    lines: z.array(
      z.object({
        description: z.string(),
        subtotalCents: z.number().int().describe("line amount WITHOUT IVA, in cents"),
        ivaRate: z.number().int().describe("15 or 0"),
        ivaCents: z.number().int(),
        accountCode: z.enum(codes),
      }),
    ),
    subtotalCents: z.number().int(),
    ivaCents: z.number().int(),
    totalCents: z.number().int(),
    notes: z.string().nullable().describe("anything the reviewer should double-check, in Spanish; null if nothing"),
  });
}

export type ReceiptReading = z.infer<ReturnType<typeof schema>>;

const SYSTEM = `You read purchase receipts for a gym in Ecuador (La Cueva) so its staff can record expenses.
Documents are Ecuadorian: facturas (with RUC, 001-001-000000123 numbers and often a 49-digit clave de acceso), notas de venta (RIMPE, no IVA breakdown), recibos and handwritten slips.
Rules:
- Amounts in integer cents. IVA in Ecuador is 15 % (some items are 0 %).
- Group items into a few lines by account; do not list every product. Keep each description short, in Spanish.
- Only a FACTURA or LIQUIDACION_COMPRA has creditable IVA. For any other document put the full amount in subtotalCents with ivaRate 0 and ivaCents 0.
- Line totals must add up to the document total.
- Pick each line's account from the list by what was bought. Drinks or supplements for resale go to the cost-of-sales account; cleaning supplies, chalk/magnesium and office supplies to supplies; repairs and gym maintenance to maintenance; a durable machine or furniture to the matching fixed-asset account.
- If something is unclear (blurry total, missing RUC), still give your best reading and explain it in notes.`;

export async function readReceipt(file: { data: Buffer; mediaType: string }, accounts: ReceiptAccount[]): Promise<ReceiptReading> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY para leer comprobantes.");
  if (!accounts.length) throw new Error("No hay cuentas para clasificar el gasto.");
  const codes = accounts.map((a) => a.code) as [string, ...string[]];
  const b64 = file.data.toString("base64");
  const media =
    file.mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: file.mediaType as "image/jpeg" | "image/png" | "image/webp", data: b64 },
        } as const);

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      output_config: { effort: "medium", format: betaZodOutputFormat(schema(codes)) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            media,
            { type: "text", text: `Accounts (code — name):\n${accounts.map((a) => `${a.code} — ${a.name}`).join("\n")}\n\nRead this receipt.` },
          ],
        },
      ],
    });
    if (res.stop_reason === "refusal") throw new Error("La IA no pudo leer este comprobante.");
    if (res.stop_reason === "max_tokens") throw new Error("El comprobante es demasiado largo para leerlo de una vez.");
    if (!res.parsed_output) throw new Error("La IA no devolvió una lectura válida.");
    return res.parsed_output;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new Error("La IA está saturada: intenta en un minuto.");
    if (e instanceof Anthropic.APIError) throw new Error(`No se pudo leer el comprobante (${e.status ?? "error"}).`);
    throw e;
  }
}
