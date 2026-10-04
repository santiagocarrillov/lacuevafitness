import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { scopedMemberWhere } from "@/app/dashboard/socios/[id]/member-scope";
import { PayerForm } from "../payer-form";
import { PayerPicker } from "../payer-assign";

export const dynamic = "force-dynamic";

/** New payer — or, from a member's file (?socio=), pick an existing one or create it for them. */
export default async function NuevoPagadorPage({ searchParams }: { searchParams: Promise<{ socio?: string }> }) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");
  const { socio } = await searchParams;
  const member = socio
    ? await prisma.member.findFirst({ where: scopedMemberWhere(user, socio), select: { id: true, firstName: true, lastName: true, payerId: true } })
    : null;
  if (socio && !member) notFound();

  if (!member) {
    return (
      <FormPage title="Nuevo pagador" description="Quien paga y recibe la factura por uno o varios socios.">
        <PayerForm after="/dashboard/finanzas/pagadores/:id" />
      </FormPage>
    );
  }

  const name = `${member.firstName} ${member.lastName}`;
  const payers = await prisma.payer.findMany({
    where: { active: true, id: member.payerId ? { not: member.payerId } : undefined },
    orderBy: { name: "asc" },
    select: { id: true, name: true, taxId: true, members: { select: { firstName: true } } },
  });
  const back = `/dashboard/socios/${member.id}`;
  return (
    <FormPage
      title={`¿Quién paga por ${member.firstName}?`}
      description={
        <>
          La factura de <Link href={back} className="text-primary hover:underline">{name}</Link> saldrá a nombre de esta persona.
        </>
      }
    >
      <div className="space-y-6">
        {payers.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Un pagador que ya existe</h2>
            <p className="text-xs text-muted-foreground">Por ejemplo, la mamá que ya paga por un hermano.</p>
            <PayerPicker memberId={member.id} memberName={member.firstName} after={back} payers={payers.map((p) => ({ id: p.id, name: p.name, taxId: p.taxId, members: p.members.map((m) => m.firstName) }))} />
          </div>
        )}
        <div className={`space-y-3 ${payers.length ? "border-t pt-5" : ""}`}>
          <h2 className="text-sm font-semibold">{payers.length ? "O uno nuevo" : "Datos del pagador"}</h2>
          <PayerForm memberId={member.id} memberName={member.firstName} after={back} />
        </div>
      </div>
    </FormPage>
  );
}
