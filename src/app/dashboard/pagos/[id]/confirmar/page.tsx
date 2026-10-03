import { notFound, redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPoolEntries } from "@/lib/actions/payments";
import { FormPage } from "@/app/dashboard/form-page";
import { ConfirmPaymentForm } from "../../confirm-payment-form";
import { safeBack } from "@/lib/safe-back";

export const dynamic = "force-dynamic";

export default async function ConfirmarPagoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string }> }) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const { volver } = await searchParams;
  const scope = getSedeScope(user);
  const p = await prisma.payment.findFirst({
    where: { id, isPoolEntry: false, ...(scope ? { sede: scope } : {}) },
    include: { member: { select: { firstName: true, lastName: true } }, membership: { include: { plan: { select: { name: true } } } } },
  });
  if (!p) notFound();
  const back = safeBack(volver, "/dashboard/pagos?tab=sin-asignar");
  if (p.status !== "PENDING") redirect(back);
  const pool = await getPoolEntries(scope ?? undefined);
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  return (
    <FormPage
      title="Confirmar cobro con el banco"
      description={`${p.member ? `${p.member.firstName} ${p.member.lastName}` : "—"} · ${fmt(p.amountCents)}${p.membership ? ` · ${p.membership.plan.name}` : ""}`}
    >
      <ConfirmPaymentForm
        backHref={back}
        payment={{ id: p.id, amountCents: p.amountCents, method: p.method, member: p.member, membership: p.membership ? { plan: { name: p.membership.plan.name } } : null }}
        poolEntries={pool.map((e) => ({ id: e.id, paidAt: e.paidAt, depositorName: e.depositorName, bankReference: e.bankReference, bankEntity: e.bankEntity, amountCents: e.amountCents }))}
      />
    </FormPage>
  );
}
