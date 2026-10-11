import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { ecuadorDateString } from "@/lib/timezone";
import { todayMainExercise } from "@/lib/srxfit/member-strength";
import { MainSetForm } from "../main-set-form";
import { memberBack, scopedMemberWhere } from "../member-scope";

export const dynamic = "force-dynamic";

export default async function SeriePrincipalPage({
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
  const back = memberBack(member.id, volver ?? `/dashboard/socios/${member.id}?tab=salud#fuerza`);
  const isActive = member.status === "ACTIVE" || member.status === "TRIAL";

  return (
    <FormPage
      title="Registrar la serie principal"
      description={
        <>
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          {" · La mejor serie del ejercicio principal del día: carga, repeticiones y cuántas le quedaban en reserva. Queda como dato oficial."}
        </>
      }
    >
      {isActive ? (
        <MainSetForm memberId={member.id} backHref={back} today={ecuadorDateString()} suggestedExercise={await todayMainExercise()} />
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-amber-700">⚠️ Socio inactivo: no se pueden registrar series hasta reactivar la membresía.</p>
          <Link href={back} className="text-primary hover:underline">← Volver</Link>
        </div>
      )}
    </FormPage>
  );
}
