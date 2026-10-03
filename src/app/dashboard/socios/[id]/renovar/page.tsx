import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ecuadorDateString } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { RenewMembershipForm } from "../renew-membership-form";
import { memberBack, pickRenewSource, plansForSede, scopedMemberWhere } from "../member-scope";

export const dynamic = "force-dynamic";

export default async function RenovarMembresiaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.editMembership(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const { volver } = await searchParams;
  const [member, plans] = await Promise.all([
    prisma.member.findFirst({
      where: scopedMemberWhere(user, id),
      select: {
        id: true, firstName: true, lastName: true, sede: true,
        memberships: { orderBy: { startsAt: "desc" }, include: { plan: true } },
      },
    }),
    prisma.membershipPlan.findMany({ where: { active: true }, orderBy: { durationDays: "asc" } }),
  ]);
  if (!member) notFound();
  const back = memberBack(member.id, volver);
  const source = pickRenewSource(member.memberships);
  // Nothing to renew from: the socio needs a plan assigned first.
  if (!source) redirect(`/dashboard/socios/${member.id}/membresia/nueva?volver=${encodeURIComponent(back)}`);

  return (
    <FormPage
      title="Renovar membresía"
      description={
        <>
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          {` · Crea la siguiente mensualidad de ${source.plan.name}. Vence actual: ${ecuadorDateString(source.endsAt)}.`}
        </>
      }
    >
      <RenewMembershipForm
        memberId={member.id}
        backHref={back}
        membership={{
          id: source.id,
          planId: source.planId,
          planName: source.plan.name,
          priceCents: source.plan.priceCents,
          customPriceCents: source.customPriceCents,
          endsAt: source.endsAt.toISOString(),
        }}
        plans={plansForSede(plans, member.sede).map((p) => ({
          id: p.id, name: p.name, priceCents: p.priceCents, durationDays: p.durationDays,
        }))}
      />
    </FormPage>
  );
}
