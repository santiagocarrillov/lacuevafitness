import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtMoney } from "@/lib/finance/entities";
import { TAX_ID_LABELS, formatDocNumber } from "@/lib/invoicing/core";
import { PageHeader } from "../../../page-header";
import { Panel } from "../../../blocks";
import { RemovePayerButton } from "../payer-assign";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function PagadorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const payer = await prisma.payer.findUnique({
    where: { id },
    include: {
      members: { select: { id: true, firstName: true, lastName: true, status: true }, orderBy: { firstName: "asc" } },
      invoices: { orderBy: { issueDate: "desc" }, take: 40, include: { emissionPoint: { select: { establishment: true, point: true } } } },
      payments: {
        where: { status: { not: "VOIDED" } },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 40,
        include: { member: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!payer) notFound();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <PageHeader title={payer.name} subtitle={`${TAX_ID_LABELS[payer.taxIdType]} ${payer.taxId}${payer.email ? ` · ${payer.email}` : ""}${payer.phone ? ` · ${payer.phone}` : ""}`}>
        <Link href={`/dashboard/finanzas/pagadores/${payer.id}/editar`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-300 px-3.5 text-sm font-medium hover:border-stone-500">
          <Pencil className="size-3.5" /> Editar
        </Link>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title={`Paga por · ${payer.members.length}`}>
          {payer.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No está asignado a ningún socio. Se asigna desde la ficha del socio.</p>
          ) : (
            <ul className="divide-y">
              {payer.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/dashboard/socios/${m.id}`} className="font-medium hover:underline">{m.firstName} {m.lastName}</Link>
                  <RemovePayerButton memberId={m.id} />
                </li>
              ))}
            </ul>
          )}
          {payer.address && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Dirección: {payer.address}</p>}
          {payer.notes && <p className="mt-1 text-xs text-muted-foreground">{payer.notes}</p>}
        </Panel>

        <Panel title="Facturas" className="lg:col-span-2">
          {payer.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin facturas todavía.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {payer.invoices.map((i) => (
                  <tr key={i.id} className={`border-b last:border-0 ${i.status === "VOIDED" ? "text-muted-foreground line-through" : ""}`}>
                    <td className="py-2 pr-3 tabular-nums">{day(i.issueDate)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/dashboard/facturas/${i.id}`} className="hover:underline">{formatDocNumber(i.emissionPoint.establishment, i.emissionPoint.point, i.sequential)}</Link>
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">{fmtMoney(i.totalCents, { decimals: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Cobros">
        {payer.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin cobros asociados todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {payer.payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 tabular-nums">{day(p.paidAt ?? p.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/dashboard/pagos/${p.id}`} className="hover:underline">{p.member ? `${p.member.firstName} ${p.member.lastName}` : "—"}</Link>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{p.status === "SUCCEEDED" ? "Confirmado" : "Sin depositar"}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{fmtMoney(p.amountCents, { decimals: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
