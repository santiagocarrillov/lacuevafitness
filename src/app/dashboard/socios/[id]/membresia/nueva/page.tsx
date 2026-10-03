import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { AssignMembershipForm } from "../../assign-membership-form";
import { memberBack, plansForSede, scopedMemberWhere } from "../../member-scope";

export const dynamic = "force-dynamic";

export default async function AsignarMembresiaPage({
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
      select: { id: true, firstName: true, lastName: true, sede: true },
    }),
    prisma.membershipPlan.findMany({ where: { active: true }, orderBy: { durationDays: "asc" } }),
  ]);
  if (!member) notFound();

  return (
    <FormPage
      title="Asignar membresía"
      description={
        <>
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          {" · Selecciona un plan para este socio."}
        </>
      }
    >
      <AssignMembershipForm
        memberId={member.id}
        backHref={memberBack(member.id, volver)}
        plans={plansForSede(plans, member.sede).map((p) => ({
          id: p.id, name: p.name, priceCents: p.priceCents, durationDays: p.durationDays,
        }))}
      />
    </FormPage>
  );
}
