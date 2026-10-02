import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { formatDocNumber } from "@/lib/invoicing/core";
import { getInvoice } from "@/lib/invoicing/queries";
import { rideInput } from "@/lib/invoicing/emit";
import { renderRide } from "@/lib/invoicing/ride";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can.editFinancials(user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const pdf = await renderRide(rideInput(inv));
  const name = `factura-${formatDocNumber(inv.emissionPoint.establishment, inv.emissionPoint.point, inv.sequential)}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"` },
  });
}
