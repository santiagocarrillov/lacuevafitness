import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { ClinicalMarkerForm } from "../../health-forms";
import { canEditHealth, memberBack, scopedMemberWhere } from "../../member-scope";

export const dynamic = "force-dynamic";

export default async function EditarLaboratorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; labId: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  // Clinical labs are private: owner + nutritionist only (same as lib/actions/health).
  if (!canEditHealth(user)) redirect("/dashboard?forbidden=1");
  const { id, labId } = await params;
  const { volver } = await searchParams;
  const member = await prisma.member.findFirst({
    where: scopedMemberWhere(user, id),
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) notFound();
  // The lab record must belong to this socio.
  const cm = await prisma.clinicalMarker.findFirst({
    where: { id: labId, memberId: member.id },
    select: {
      id: true, measuredAt: true, glucoseFasting: true, triglycerides: true, hdlCholesterol: true,
      hsCRP: true, testosteroneFree: true, estradiolE2: true, cycleDay: true,
      menopausalStatus: true, notes: true,
    },
  });
  if (!cm) notFound();

  return (
    <FormPage
      title="Editar laboratorio"
      wide
      description={
        <>
          {"Marcadores clínicos de "}
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          {". Seguimiento educativo y nutricional; no reemplaza la evaluación médica."}
        </>
      }
    >
      <ClinicalMarkerForm
        memberId={member.id}
        edit={{ ...cm, measuredAt: cm.measuredAt.toISOString() }}
        backHref={memberBack(member.id, volver)}
      />
    </FormPage>
  );
}
