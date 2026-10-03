import { redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { RegisterPaymentForm } from "../payment-form";
import { safeBack } from "@/lib/safe-back";

export const dynamic = "force-dynamic";

export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<{ socio?: string; membresia?: string; volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");
  const params = await searchParams;
  const scope = getSedeScope(user);
  const members = await prisma.member.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL", "PAUSED"] }, ...(scope ? { sede: scope } : {}) },
    select: { id: true, firstName: true, lastName: true, sede: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
  // A member opened from their file may be outside the list (lead, churned…).
  const initial =
    (params.socio && (members.find((m) => m.id === params.socio) ??
      (await prisma.member.findFirst({ where: { id: params.socio, ...(scope ? { sede: scope } : {}) }, select: { id: true, firstName: true, lastName: true, sede: true } })))) ||
    null;
  const back = safeBack(params.volver, initial ? `/dashboard/socios/${initial.id}` : "/dashboard/pagos");

  return (
    <FormPage
      title="Registrar cobro"
      description="Efectivo → queda confirmado. Transferencia o tarjeta → queda como fondos sin depositar hasta que Isabel lo vea en el banco."
    >
      <RegisterPaymentForm
        members={initial && !members.some((m) => m.id === initial.id) ? [initial, ...members] : members}
        initialMember={initial}
        initialMembershipId={params.membresia ?? null}
        canPickSede={can.editFinancials(user)}
        defaultSede={user.sede ?? "FITNESS_CENTER"}
        backHref={back}
        invoiceHref={can.editFinancials(user) ? "/dashboard/facturas/nueva" : null}
      />
    </FormPage>
  );
}
