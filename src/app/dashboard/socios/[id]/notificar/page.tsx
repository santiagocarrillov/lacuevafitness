import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { MemberPushForm } from "../member-push-form";
import { memberBack, scopedMemberWhere } from "../member-scope";

export const dynamic = "force-dynamic";

export default async function NotificarSocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  // Same roles as sendPushToMember (OWNER, ACCOUNTING, ADMIN).
  if (!can.manageMembers(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const { volver } = await searchParams;
  const member = await prisma.member.findFirst({
    where: scopedMemberWhere(user, id),
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) notFound();

  return (
    <FormPage
      title="Enviar notificación"
      description={
        <>
          {"Push a los dispositivos de "}
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          .
        </>
      }
    >
      <MemberPushForm memberId={member.id} backHref={memberBack(member.id, volver)} />
    </FormPage>
  );
}
