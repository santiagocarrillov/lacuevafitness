import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { SingleTestForm } from "../single-test-form";
import { memberBack, scopedMemberWhere } from "../member-scope";

export const dynamic = "force-dynamic";

export default async function TestIndividualPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.editTests(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const { volver } = await searchParams;
  const member = await prisma.member.findFirst({
    where: scopedMemberWhere(user, id),
    select: { id: true, firstName: true, lastName: true, status: true },
  });
  if (!member) notFound();
  const back = memberBack(member.id, volver);
  const isActive = member.status === "ACTIVE" || member.status === "TRIAL";

  return (
    <FormPage
      title="Registrar un test individual"
      description={
        <>
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          {" · Para medir un solo movimiento sin hacer toda la batería (ej. un re-test cada 4 semanas)."}
        </>
      }
    >
      {isActive ? (
        <SingleTestForm memberId={member.id} backHref={back} />
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-amber-700">
            ⚠️ Socio inactivo: no se pueden registrar tests hasta reactivar la membresía.
          </p>
          <Link href={back} className="text-primary hover:underline">← Volver</Link>
        </div>
      )}
    </FormPage>
  );
}
