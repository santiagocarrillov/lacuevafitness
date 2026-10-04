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
  formatDocNumber,
  invoiceTotals,
  lineAmounts,
  taxIdError,
} from "@/lib/invoicing/core";
import { buildAccessKey } from "@/lib/invoicing/xml";
import { ENTITIES } from "@/lib/finance/entities";
import { certStatus, emailInvoice, emitInvoice, forgetEntityCert, refreshAuthorization, type CertStatus, type EmitResult } from "@/lib/invoicing/emit";
import { loadP12 } from "@/lib/invoicing/xades";
import { storeCertificate } from "@/lib/storage/upload";

const PATH = "/dashboard/facturas";
const MEMBERSHIP_INCOME_CODE = "4.1.01"; // Mensualidades
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
  /** Or several (siblings paid by the same payer, one invoice). Total = their sum. */
  paymentIds?: string[];
  /**
   * Who pays when it isn't the member: an existing payer (`id`), or `save` to
   * create/update one from the buyer data and assign it to the member(s).
   */
  payer?: { id?: string | null; save?: boolean } | null;
  payment?: {
    method: PaymentMethod;
    depositorName?: string;
    bankReference?: string;
    bankEntity?: string;
  };
  notes?: string;
};

export async function createInvoice(input: InvoiceDraft): Promise<{ id: string; emission?: EmitResult | { status: "ERROR"; error: string } }> {
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

  const paymentIds = [...new Set(input.paymentIds?.length ? input.paymentIds : input.paymentId ? [input.paymentId] : [])];
  const included = paymentIds.length
    ? await prisma.payment.findMany({ where: { id: { in: paymentIds } }, include: { invoice: { select: { status: true } } } })
    : [];
  // Members on this invoice: the one chosen plus those of the collections included.
  const memberIds = new Set<string>([input.memberId, ...included.map((p) => p.memberId)].filter((x): x is string => !!x));

  // Membership lines must belong to a member on the invoice.
  const membershipIds = lines.map((l) => l.membershipId).filter((x): x is string => !!x);
  const membershipOwner = new Map<string, string>();
  if (membershipIds.length) {
    if (!memberIds.size) throw new Error("Una línea de membresía necesita un socio.");
    const ms = await prisma.membership.findMany({ where: { id: { in: membershipIds } }, select: { id: true, memberId: true } });
    for (const m of ms) membershipOwner.set(m.id, m.memberId);
    if (ms.length !== new Set(membershipIds).size || ms.some((m) => !memberIds.has(m.memberId))) {
      throw new Error("La membresía no es de un socio de esta factura.");
    }
  }

  const ruc = ENTITIES[input.sede].ruc;
  if (!ruc) throw new Error("Falta el RUC de la entidad.");

  const invoice = await prisma.$transaction(async (tx) => {
    // Existing collections, if any: not invoiced yet, same entity, and their
    // sum is the invoice total.
    if (paymentIds.length) {
      const fresh = await tx.payment.findMany({ where: { id: { in: paymentIds } }, include: { invoice: { select: { status: true } } } });
      if (fresh.length !== paymentIds.length) throw new Error("No se encontró el cobro.");
      for (const p of fresh) {
        if (p.isPoolEntry || p.status === "VOIDED" || p.status === "FAILED" || p.status === "REFUNDED") throw new Error("Ese cobro no se puede facturar.");
        if (p.invoice && p.invoice.status !== "VOIDED") throw new Error("Ese cobro ya tiene factura.");
        if (p.sede !== input.sede) throw new Error("El cobro es de la otra entidad.");
      }
      const sum = fresh.reduce((a, p) => a + p.amountCents, 0);
      if (sum !== totals.totalCents) {
        throw new Error(`La factura ($${(totals.totalCents / 100).toFixed(2)}) debe ser igual a lo cobrado ($${(sum / 100).toFixed(2)}).`);
      }
    } else if (!input.payment || !METHODS.includes(input.payment.method)) {
      throw new Error("Indica cómo pagó el cliente.");
    }

    // A member's membership is invoiced once a month. Invoicing it again
    // needs another collection the bank already confirmed (Santiago, 4 oct 2026).
    const membersWithMembership = new Set<string>();
    for (const l of lines) {
      if (l.membershipId) membersWithMembership.add(membershipOwner.get(l.membershipId)!);
      else if (l.incomeAccountCode === MEMBERSHIP_INCOME_CODE && input.memberId) membersWithMembership.add(input.memberId);
    }
    if (membersWithMembership.size) {
      const start = new Date(Date.UTC(issueDate.getUTCFullYear(), issueDate.getUTCMonth(), 1));
      const end = new Date(Date.UTC(issueDate.getUTCFullYear(), issueDate.getUTCMonth() + 1, 1));
      for (const memberId of membersWithMembership) {
        const confirmed = included.some((p) => p.memberId === memberId && p.status === "SUCCEEDED");
        if (confirmed) continue;
        const prior = await tx.invoice.findFirst({
          where: {
            status: { not: "VOIDED" },
            issueDate: { gte: start, lt: end },
            OR: [
              { memberId, lines: { some: { OR: [{ membershipId: { not: null } }, { incomeAccountCode: MEMBERSHIP_INCOME_CODE }] } } },
              { lines: { some: { membership: { memberId } } } },
            ],
          },
          include: { emissionPoint: { select: { establishment: true, point: true } } },
        });
        if (prior) {
          const who = await tx.member.findUnique({ where: { id: memberId }, select: { firstName: true, lastName: true } });
          const num = formatDocNumber(prior.emissionPoint.establishment, prior.emissionPoint.point, prior.sequential);
          throw new Error(
            `${who ? `${who.firstName} ${who.lastName}` : "Este socio"} ya tiene factura de membresía este mes (${num}). ` +
              "Solo se vuelve a facturar con otro pago comprobado: regístralo en Pagos, confírmalo con el banco y factúralo desde ese cobro.",
          );
        }
      }
    }

    // Payer: an existing one, or create/update it from the buyer data.
    let payerId: string | null = null;
    if (input.payer && b.type !== "CONSUMIDOR_FINAL") {
      if (input.payer.id) {
        const found = await tx.payer.findUnique({ where: { id: input.payer.id }, select: { id: true } });
        if (!found) throw new Error("No se encontró el pagador.");
        payerId = found.id;
      } else if (input.payer.save) {
        const data = {
          name: buyerName,
          email: b.email?.trim() || null,
          phone: b.phone?.trim() || null,
          address: b.address?.trim() || null,
        };
        const saved = await tx.payer.upsert({
          where: { taxIdType_taxId: { taxIdType: b.type, taxId: buyerId } },
          create: { ...data, taxIdType: b.type, taxId: buyerId },
          update: data,
        });
        payerId = saved.id;
      }
      if (payerId && input.payer.save && memberIds.size) {
        await tx.member.updateMany({ where: { id: { in: [...memberIds] } }, data: { payerId } });
      }
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
        memberId: input.memberId || included.find((p) => p.memberId)?.memberId || null,
        payerId,
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

    if (paymentIds.length) {
      await tx.payment.updateMany({ where: { id: { in: paymentIds } }, data: { invoiceId: inv.id, ...(payerId ? { payerId } : {}) } });
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
          payerId,
          notes: input.notes?.trim() || null,
        },
      });
    }

    if (input.memberId && input.saveToMember && !payerId && !input.payer && b.type !== "CONSUMIDOR_FINAL") {
      await tx.member.update({ where: { id: input.memberId }, data: { taxIdType: b.type, taxId: buyerId } });
    }
    return inv;
  });

  // Emit right away when the entity's signature is set up. The invoice and the
  // collection are already saved: an SRI failure only leaves it to retry.
  let emission: EmitResult | { status: "ERROR"; error: string } | undefined;
  if ((await certStatus(input.sede)).ready) {
    emission = await emitInvoice(invoice.id).catch((e) => ({ status: "ERROR" as const, error: e instanceof Error ? e.message : String(e) }));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/pagos");
  for (const m of memberIds) revalidatePath(`/dashboard/socios/${m}`);
  return { id: invoice.id, emission };
}

// ── Emission ────────────────────────────────────────────────────────────────

/** Sends a draft/rejected invoice to the SRI (or re-checks a sent one). */
export async function emitInvoiceNow(id: string): Promise<EmitResult> {
  await requireInvoicing();
  const r = await emitInvoice(id);
  revalidatePath(`${PATH}/${id}`);
  revalidatePath(PATH);
  return r;
}

export async function refreshInvoice(id: string): Promise<EmitResult> {
  await requireInvoicing();
  const r = await refreshAuthorization(id);
  revalidatePath(`${PATH}/${id}`);
  return r;
}

export async function sendInvoiceEmail(id: string, to?: string): Promise<{ to: string }> {
  await requireInvoicing();
  if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) throw new Error("Correo inválido.");
  const r = await emailInvoice(id, to || undefined);
  revalidatePath(`${PATH}/${id}`);
  return r;
}

export async function getCertificateStatuses(): Promise<CertStatus[]> {
  await requireInvoicing();
  return Promise.all(SEDES.map((s) => certStatus(s)));
}

/** Uploads an entity's .p12. Its password is set by Santiago as a Vercel env
 *  var; when it is already there the file is checked before it is saved. */
export async function uploadCertificate(fd: FormData): Promise<CertStatus> {
  const user = await requireInvoicing();
  if (user.role !== "OWNER") throw new Error("Solo Santiago puede cambiar la firma electrónica.");
  const sede = fd.get("sede") as Sede;
  if (!SEDES.includes(sede)) throw new Error("Entidad inválida.");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Elige el archivo .p12.");
  if (!/\.(p12|pfx)$/i.test(file.name)) throw new Error("La firma debe ser un archivo .p12 o .pfx.");
  const buf = Buffer.from(await file.arrayBuffer());
  const password = process.env[`SRI_CERT_PASSWORD_${sede}`];
  if (password) loadP12(buf, password); // throws a readable error if it does not open
  await storeCertificate(sede, buf);
  forgetEntityCert(sede);
  revalidatePath(PATH);
  return certStatus(sede);
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
