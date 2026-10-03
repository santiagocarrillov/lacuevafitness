import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { BodyCompForm } from "../../health-forms";
import { canEditHealth, memberBack, scopedMemberWhere } from "../../member-scope";

export const dynamic = "force-dynamic";

export default async function EditarMedicionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; medicionId: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  // Health data is private: owner + nutritionist only (same as lib/actions/health).
  if (!canEditHealth(user)) redirect("/dashboard?forbidden=1");
  const { id, medicionId } = await params;
  const { volver } = await searchParams;
  const member = await prisma.member.findFirst({
    where: scopedMemberWhere(user, id),
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) notFound();
  // The measurement must belong to this socio.
  const bc = await prisma.bodyComposition.findFirst({
    where: { id: medicionId, memberId: member.id },
    select: {
      id: true, measuredAt: true, weightKg: true, heightCm: true, bodyFatPct: true,
      muscleMassKg: true, muscleMassPct: true, waistCm: true, hipCm: true, chestCm: true,
      armCm: true, thighCm: true, basalMetabolism: true, notes: true,
    },
  });
  if (!bc) notFound();

  return (
    <FormPage
      title="Editar medición"
      description={
        <>
          {"Composición corporal de "}
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          .
        </>
      }
    >
      <BodyCompForm
        memberId={member.id}
        edit={{ ...bc, measuredAt: bc.measuredAt.toISOString() }}
        backHref={memberBack(member.id, volver)}
      />
    </FormPage>
  );
}
