import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { EditPaymentForm } from "../edit-payment-form";
import { safeBack } from "@/lib/safe-back";

export const dynamic = "force-dynamic";

export default async function EditarPagoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string }> }) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const { volver } = await searchParams;
  const scope = getSedeScope(user);
  const p = await prisma.payment.findFirst({
    where: { id, ...(scope ? { sede: scope } : {}) },
    include: { member: { select: { id: true, firstName: true, lastName: true } }, membership: { include: { plan: { select: { name: true } } } }, invoice: { select: { id: true, status: true } } },
  });
  if (!p) notFound();
  const back = safeBack(volver, "/dashboard/pagos");
  return (
    <FormPage
      title="Editar cobro"
      description={
        <>
          {p.member ? (
            <Link href={`/dashboard/socios/${p.member.id}`} className="text-primary hover:underline">
              {p.member.firstName} {p.member.lastName}
            </Link>
          ) : (
            p.depositorName ?? "Depósito sin asignar"
          )}
          {p.membership && ` · ${p.membership.plan.name}`}
          {p.invoice && p.invoice.status !== "VOIDED" && (
            <>
              {" · "}
              <Link href={`/dashboard/facturas/${p.invoice.id}`} className="text-primary hover:underline">ver factura</Link>
            </>
          )}
          {p.status === "PENDING" && !p.isPoolEntry && (
            <>
              {" · "}
              <Link href={`/dashboard/pagos/${p.id}/confirmar?volver=${encodeURIComponent(back)}`} className="text-primary hover:underline">confirmar con el banco</Link>
            </>
          )}
        </>
      }
    >
      <EditPaymentForm
        backHref={back}
        payment={{
          id: p.id,
          amountCents: p.amountCents,
          method: p.method,
          status: p.status,
          paidAt: p.paidAt,
          depositorName: p.depositorName,
          bankReference: p.bankReference,
          bankEntity: p.bankEntity,
          notes: p.notes,
        }}
      />
    </FormPage>
  );
}
