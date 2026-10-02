"use server";

// Facturación (Módulo 2a): invoice + collection in one step, own emission
// points, sale-item catalog. Invoices are numbered and their XML is built,
// but they stay DRAFT until signing/SRI submission lands (2b).
// Design: docs/facturacion-sri.md. Never DELETE: invoices are voided.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { assertOpen } from "@/lib/accounting/posting";
import type { PaymentMethod, PaymentStatus, Sede, SaleItemKind, SriEnvironment, TaxIdType } from "@/generated/prisma/client";
import {
  BUYER_ID_CODES,
  CONSUMER_FINAL_ID,
  CONSUMER_FINAL_MAX_CENTS,
  CONSUMER_FINAL_NAME,
  INCOME_ACCOUNTS,
  PAY_FORM_LABELS,
  invoiceTotals,
  lineAmounts,
  taxIdError,
} from "@/lib/invoicing/core";
import { buildAccessKey } from "@/lib/invoicing/xml";
import { ENTITIES } from "@/lib/finance/entities";

const PATH = "/dashboard/facturas";
const SEDES: Sede[] = ["FITNESS_CENTER", "XTREME"];
const METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "STRIPE_CARD", "PLUX_CARD", "STRIPE_LINK", "OTHER"];

// 2a: only OWNER/ACCOUNTING while invoices are test drafts. When emission is
// live (2c) admins will invoice at the front desk too.
async function requireInvoicing() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");
  return user;
}

const day = (ymd: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("Fecha inválida.");
  return new Date(`${ymd}T00:00:00.000Z`);
};

export type InvoiceLineDraft = {
  membershipId?: string | null;
  saleItemId?: string | null;
  code: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  ivaRate: number;
  incomeAccountCode: string;
};

export type InvoiceDraft = {
  sede: Sede;
  emissionPointId: string;
  issueDate: string; // YYYY-MM-DD
  memberId?: string | null;
  buyer: {
    type: TaxIdType | "CONSUMIDOR_FINAL";
    id: string;
    name: string;
    email?: string;
    address?: string;
    phone?: string;
  };
  /** Store the buyer's ID on the member's file for next time. */
  saveToMember?: boolean;
  lines: InvoiceLineDraft[];
  payForm: string;
  /** Invoice an existing collection instead of recording a new one. */
  paymentId?: string | null;
  payment?: {
    method: PaymentMethod;
    depositorName?: string;
    bankReference?: string;
    bankEntity?: string;
  };
  notes?: string;
};

export async function createInvoice(input: InvoiceDraft): Promise<{ id: string }> {
  const user = await requireInvoicing();
  if (!SEDES.includes(input.sede)) throw new Error("Entidad inválida.");
  const issueDate = day(input.issueDate);
  await assertOpen(prisma, input.sede, issueDate);

  // Lines
  if (!input.lines.length) throw new Error("Agrega al menos una línea.");
  const lines = input.lines.map((l, i) => {
    const description = l.description.trim();
    if (!description) throw new Error(`La línea ${i + 1} no tiene descripción.`);
    if (!INCOME_ACCOUNTS.some((a) => a.code === l.incomeAccountCode)) throw new Error(`Cuenta de ingreso inválida en la línea ${i + 1}.`);
    if (l.ivaRate !== 15 && l.ivaRate !== 0) throw new Error("Tarifa de IVA no soportada.");
    const a = lineAmounts(l);
    return { ...l, description, code: (l.code || "VARIOS").trim().slice(0, 25), a };
  });
  const totals = invoiceTotals(lines);
  if (totals.totalCents <= 0) throw new Error("El total debe ser mayor que cero.");

  // Buyer
  const b = input.buyer;
  let buyerIdType: string, buyerId: string, buyerName: string;
  if (b.type === "CONSUMIDOR_FINAL") {
    if (totals.totalCents > CONSUMER_FINAL_MAX_CENTS) {
      throw new Error("A consumidor final solo se puede facturar hasta $50. Pide la cédula o el RUC.");
    }
    buyerIdType = BUYER_ID_CODES.CONSUMIDOR_FINAL;
    buyerId = CONSUMER_FINAL_ID;
    buyerName = CONSUMER_FINAL_NAME;
  } else {
    const err = taxIdError(b.type, b.id);
    if (err) throw new Error(err);
    if (!b.name.trim()) throw new Error("Falta el nombre o la razón social del cliente.");
    buyerIdType = BUYER_ID_CODES[b.type];
    buyerId = b.id.trim().toUpperCase();
    buyerName = b.name.trim();
  }
  if (!PAY_FORM_LABELS[input.payForm]) throw new Error("Forma de pago del SRI inválida.");

  // Membership lines must belong to the member being invoiced.
  const membershipIds = lines.map((l) => l.membershipId).filter((x): x is string => !!x);
  if (membershipIds.length) {
    if (!input.memberId) throw new Error("Una línea de membresía necesita un socio.");
    const n = await prisma.membership.count({ where: { id: { in: membershipIds }, memberId: input.memberId } });
    if (n !== new Set(membershipIds).size) throw new Error("La membresía no es de este socio.");
  }

  const ruc = ENTITIES[input.sede].ruc;
  if (!ruc) throw new Error("Falta el RUC de la entidad.");

  const invoice = await prisma.$transaction(async (tx) => {
    // Existing collection, if any: must match the total and not be invoiced yet.
    if (input.paymentId) {
      const p = await tx.payment.findUnique({ where: { id: input.paymentId }, include: { invoice: { select: { status: true } } } });
      if (!p || p.isPoolEntry) throw new Error("No se encontró el cobro.");
      if (p.invoice && p.invoice.status !== "VOIDED") throw new Error("Ese cobro ya tiene factura.");
      if (p.sede !== input.sede) throw new Error("El cobro es de la otra entidad.");
      if (p.amountCents !== totals.totalCents) {
        throw new Error(`La factura ($${(totals.totalCents / 100).toFixed(2)}) debe ser igual al cobro ($${(p.amountCents / 100).toFixed(2)}).`);
      }
    } else if (!input.payment || !METHODS.includes(input.payment.method)) {
      throw new Error("Indica cómo pagó el cliente.");
    }

    // Atomic numbering: the UPDATE row-locks the emission point.
    const point = await tx.emissionPoint.update({
      where: { id: input.emissionPointId, sede: input.sede, active: true },
      data: { lastSequential: { increment: 1 } },
    }).catch(() => {
      throw new Error("El punto de emisión no existe o está inactivo para esta entidad.");
    });
    const accessKey = buildAccessKey({
      issueDate,
      ruc,
      environment: point.environment,
      establishment: point.establishment,
      point: point.point,
      sequential: point.lastSequential,
    });

    const inv = await tx.invoice.create({
      data: {
        sede: input.sede,
        emissionPointId: point.id,
        sequential: point.lastSequential,
        accessKey,
        environment: point.environment,
        issueDate,
        memberId: input.memberId || null,
        buyerIdType,
        buyerId,
        buyerName,
        buyerEmail: b.email?.trim() || null,
        buyerAddress: b.address?.trim() || null,
        buyerPhone: b.phone?.trim() || null,
        subtotalCents: totals.subtotalCents,
        ivaCents: totals.ivaCents,
        totalCents: totals.totalCents,
        sriPayForm: input.payForm,
        notes: input.notes?.trim() || null,
        createdById: user.id,
        lines: {
          create: lines.map((l, i) => ({
            position: i + 1,
            code: l.code,
            description: l.description,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            discountCents: l.discountCents,
            ivaRate: l.ivaRate,
            subtotalCents: l.a.subtotalCents,
            ivaCents: l.a.ivaCents,
            totalCents: l.a.totalCents,
            incomeAccountCode: l.incomeAccountCode,
            membershipId: l.membershipId || null,
            saleItemId: l.saleItemId || null,
          })),
        },
      },
    });

    if (input.paymentId) {
      await tx.payment.update({ where: { id: input.paymentId }, data: { invoiceId: inv.id } });
    } else {
      // Same status rule as registerMemberPayment: cash is final, the rest
      // waits for Isabel to see it in the bank ("fondos sin depositar").
      const p = input.payment!;
      const status: PaymentStatus = p.method === "CASH" ? "SUCCEEDED" : "PENDING";
      await tx.payment.create({
        data: {
          memberId: input.memberId || null,
          membershipId: membershipIds[0] ?? null,
          amountCents: totals.totalCents,
          method: p.method,
          status,
          paidAt: issueDate,
          depositorName: p.depositorName?.trim() || null,
          bankReference: p.bankReference?.trim() || null,
          bankEntity: p.bankEntity?.trim() || null,
          sede: input.sede,
          recordedByUserId: user.id,
          invoiceId: inv.id,
          notes: input.notes?.trim() || null,
        },
      });
    }

    if (input.memberId && input.saveToMember && b.type !== "CONSUMIDOR_FINAL") {
      await tx.member.update({ where: { id: input.memberId }, data: { taxIdType: b.type, taxId: buyerId } });
    }
    return inv;
  });

  revalidatePath(PATH);
  revalidatePath("/dashboard/pagos");
  if (input.memberId) revalidatePath(`/dashboard/socios/${input.memberId}`);
  return { id: invoice.id };
}

/**
 * Voids a draft or rejected invoice. The collection stays (it is real money)
 * and goes back to being posted on its own; it can be invoiced again.
 * An AUTHORIZED invoice needs a credit note instead (2c).
 */
export async function voidInvoice(id: string, reason: string) {
  await requireInvoicing();
  if (!reason.trim()) throw new Error("Escribe el motivo de la anulación.");
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status === "VOIDED") return;
  if (inv.status === "AUTHORIZED" || inv.status === "SENT") {
    throw new Error("Una factura enviada o autorizada por el SRI se corrige con una nota de crédito.");
  }
  await assertOpen(prisma, inv.sede, inv.issueDate);
  await prisma.$transaction([
    prisma.invoice.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason.trim() } }),
    prisma.payment.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
  ]);
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${id}`);
}

// ── Configuration ───────────────────────────────────────────────────────────

export async function saveEmissionPoint(input: {
  id?: string;
  sede: Sede;
  establishment: string;
  point: string;
  address: string;
  lastSequential: number;
  environment: SriEnvironment;
  active: boolean;
}) {
  await requireInvoicing();
  if (!SEDES.includes(input.sede)) throw new Error("Entidad inválida.");
  if (!/^\d{3}$/.test(input.establishment) || !/^\d{3}$/.test(input.point)) {
    throw new Error("Establecimiento y punto de emisión son 3 dígitos (001).");
  }
  if (!input.address.trim()) throw new Error("Escribe la dirección del establecimiento.");
  if (!Number.isInteger(input.lastSequential) || input.lastSequential < 0) throw new Error("Secuencial inválido.");
  const data = {
    sede: input.sede,
    establishment: input.establishment,
    point: input.point,
    address: input.address.trim(),
    environment: input.environment === "PRODUCCION" ? ("PRODUCCION" as const) : ("PRUEBAS" as const),
    active: input.active,
  };
  if (input.id) {
    const cur = await prisma.emissionPoint.findUniqueOrThrow({ where: { id: input.id } });
    const used = await prisma.invoice.aggregate({ where: { emissionPointId: input.id }, _max: { sequential: true } });
    if (input.lastSequential < (used._max.sequential ?? 0)) {
      throw new Error(`Ya se emitió hasta el ${used._max.sequential}: el secuencial no puede bajar.`);
    }
    if (used._max.sequential && (cur.sede !== data.sede || cur.establishment !== data.establishment || cur.point !== data.point || cur.environment !== data.environment)) {
      throw new Error("Este punto ya tiene facturas: crea uno nuevo en lugar de cambiar su numeración o ambiente.");
    }
    await prisma.emissionPoint.update({ where: { id: input.id }, data: { ...data, lastSequential: input.lastSequential } });
  } else {
    await prisma.emissionPoint.create({ data: { ...data, lastSequential: input.lastSequential } }).catch(() => {
      throw new Error("Ya existe ese punto de emisión para esta entidad y ambiente.");
    });
  }
  revalidatePath(PATH);
}

export async function saveSaleItem(input: {
  id?: string;
  sede: Sede | null;
  name: string;
  priceCents: number;
  ivaRate: number;
  kind: SaleItemKind;
  incomeAccountCode: string;
  active: boolean;
}) {
  await requireInvoicing();
  if (!input.name.trim()) throw new Error("Escribe el nombre.");
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) throw new Error("Precio inválido.");
  if (input.ivaRate !== 15 && input.ivaRate !== 0) throw new Error("IVA 15 % o 0 %.");
  if (!INCOME_ACCOUNTS.some((a) => a.code === input.incomeAccountCode)) throw new Error("Cuenta de ingreso inválida.");
  if (input.sede && !SEDES.includes(input.sede)) throw new Error("Entidad inválida.");
  const data = {
    sede: input.sede,
    name: input.name.trim(),
    priceCents: input.priceCents,
    ivaRate: input.ivaRate,
    kind: input.kind === "GOOD" ? ("GOOD" as const) : ("SERVICE" as const),
    incomeAccountCode: input.incomeAccountCode,
    active: input.active,
  };
  if (input.id) await prisma.saleItem.update({ where: { id: input.id }, data });
  else await prisma.saleItem.create({ data });
  revalidatePath(PATH);
}
