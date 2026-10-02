// Server-side invoice helpers (no auth — callers check permissions).

import { prisma } from "@/lib/prisma";
import { buildInvoiceXml } from "@/lib/invoicing/xml";

export async function getInvoice(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      emissionPoint: true,
      lines: { orderBy: { position: "asc" }, include: { membership: { include: { plan: { select: { name: true } } } } } },
      payments: { select: { id: true, method: true, status: true, amountCents: true, paidAt: true, bankReference: true, bankEntity: true, depositorName: true } },
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

/** Rebuilds the unsigned XML from what was stored when the invoice was created. */
export function invoiceXml(inv: InvoiceDetail): string {
  return buildInvoiceXml({
    sede: inv.sede,
    environment: inv.environment,
    establishment: inv.emissionPoint.establishment,
    point: inv.emissionPoint.point,
    establishmentAddress: inv.emissionPoint.address,
    sequential: inv.sequential,
    accessKey: inv.accessKey,
    issueDate: inv.issueDate,
    buyerIdType: inv.buyerIdType,
    buyerId: inv.buyerId,
    buyerName: inv.buyerName,
    buyerAddress: inv.buyerAddress,
    buyerEmail: inv.buyerEmail,
    buyerPhone: inv.buyerPhone,
    payForm: inv.sriPayForm,
    lines: inv.lines.map((l) => ({
      code: l.code,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      discountCents: l.discountCents,
      ivaRate: l.ivaRate,
    })),
  });
}
