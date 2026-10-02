import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { formatDocNumber } from "@/lib/invoicing/core";
import { getInvoice, invoiceXml } from "@/lib/invoicing/queries";
import { readFinanceDoc } from "@/lib/storage/upload";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can.editFinancials(user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const name = `factura-${formatDocNumber(inv.emissionPoint.establishment, inv.emissionPoint.point, inv.sequential)}.xml`;
  // Authorized invoices: the XML as the SRI authorized it (signed). Otherwise the unsigned draft.
  const stored = inv.xmlPath ? await readFinanceDoc(inv.xmlPath) : null;
  return new NextResponse(stored ? new Uint8Array(stored) : invoiceXml(inv), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
