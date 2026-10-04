import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// From a journal entry to the document that produced it (drill-down from the
// ledger and the journal). ?source=…&id=…&sede=…&fecha=YYYY-MM-DD&entry=…
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can.viewFinancials(user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const u = new URL(req.url);
  const source = u.searchParams.get("source") ?? "";
  const raw = u.searchParams.get("id") ?? "";
  const sede = u.searchParams.get("sede") === "FITNESS_CENTER" ? "FITNESS_CENTER" : "XTREME";
  const fecha = u.searchParams.get("fecha") ?? "";
  const mes = /^\d{4}-\d{2}/.test(fecha) ? fecha.slice(0, 7) : "";
  const entry = u.searchParams.get("entry") ?? "";
  const go = (path: string) => NextResponse.redirect(new URL(path, u.origin));
  const journal = () => go(`/dashboard/contabilidad?tab=diario&entidad=${sede}${mes ? `&mes=${mes}` : ""}${entry ? `#asiento-${entry}` : ""}`);
  const id = raw.split(":")[0];

  async function payment(pid: string) {
    const p = await prisma.payment.findUnique({ where: { id: pid }, select: { memberId: true, invoiceId: true } });
    if (p?.invoiceId) return go(`/dashboard/facturas/${p.invoiceId}`);
    if (p?.memberId) return go(`/dashboard/socios/${p.memberId}`);
    return go("/dashboard/pagos");
  }

  switch (source) {
    case "INVOICE":
      return go(`/dashboard/facturas/${id}`);
    case "PAYMENT":
      return payment(id);
    case "DEFERRED_REVENUE": {
      // `${paymentId}:k` or `${invoiceLineId}:k`
      const line = await prisma.invoiceLine.findUnique({ where: { id }, select: { invoiceId: true } });
      return line ? go(`/dashboard/facturas/${line.invoiceId}`) : payment(id);
    }
    case "EXPENSE":
      return go(`/dashboard/gastos/${id}`);
    case "OTHER_INCOME":
      return go(`/dashboard/finanzas/otros-ingresos${mes ? `?mes=${mes}` : ""}`);
    case "CAPITAL":
      return go(`/dashboard/finanzas/aportes${mes ? `?mes=${mes}` : ""}`);
    case "BANK":
      return go("/dashboard/finanzas/banco");
    case "DEPRECIATION":
      return go(`/dashboard/contabilidad?tab=activos&entidad=${sede}`);
    default:
      return journal();
  }
}
