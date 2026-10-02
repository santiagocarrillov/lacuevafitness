import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { ENTITIES } from "@/lib/finance/entities";
import { ivaMonth } from "@/lib/taxes/iva";
import { buildAts } from "@/lib/taxes/ats";

// ATS of La Cueva Xtreme S.A.S. for a month, ready to load in the DIMM.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can.viewFinancials(user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const ym = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(ym)) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  const e = ENTITIES.XTREME;
  const m = await ivaMonth("XTREME", ym);
  const [y, mo] = ym.split("-").map(Number);
  const xml = buildAts({ ruc: e.ruc!, legalName: e.legalName, year: y, month: mo, establishments: ["001"], purchases: m.purchases.docs });
  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="AT${String(mo).padStart(2, "0")}${y}.xml"` },
  });
}
