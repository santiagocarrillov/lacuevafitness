import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { BodyCompForm } from "../../health-forms";
import { canEditHealth, memberBack, scopedMemberWhere } from "../../member-scope";

export const dynamic = "force-dynamic";

export default async function NuevaMedicionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  // Health data is private: owner + nutritionist only (same as lib/actions/health).
  if (!canEditHealth(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const { volver } = await searchParams;
  const member = await prisma.member.findFirst({
    where: scopedMemberWhere(user, id),
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) notFound();

  return (
    <FormPage
      title="Nueva medición"
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
      <BodyCompForm memberId={member.id} edit={null} backHref={memberBack(member.id, volver)} />
    </FormPage>
  );
}
