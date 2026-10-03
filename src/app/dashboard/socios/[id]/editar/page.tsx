import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { MemberInfoForm } from "../member-info-form";
import { memberBack, scopedMemberWhere } from "../member-scope";

export const dynamic = "force-dynamic";

export default async function EditarSocioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ solo?: string; volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewMembers(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const { solo, volver } = await searchParams;
  const member = await prisma.member.findFirst({
    where: scopedMemberWhere(user, id),
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true, dateOfBirth: true,
      address: true, occupation: true, emergencyName: true, emergencyPhone: true,
      sede: true, secondarySede: true, notes: true, userId: true,
    },
  });
  if (!member) notFound();
  // Only the front desk edits the whole file; everyone else fixes contact data.
  const contactOnly = !can.manageMembers(user) || solo === "contacto";
  const back = memberBack(member.id, volver);

  return (
    <FormPage
      title={contactOnly ? "Editar contacto" : "Editar información personal"}
      wide={!contactOnly}
      description={
        <>
          <Link href={`/dashboard/socios/${member.id}`} className="text-primary hover:underline">
            {member.firstName} {member.lastName}
          </Link>
          {" · "}
          {contactOnly ? "Correo y teléfono del socio. El resto lo cambia recepción." : "Actualiza los datos del socio."}
          {member.userId != null && " Ya usa la app: si cambias el correo, también cambia el correo con el que entra."}
        </>
      }
    >
      <MemberInfoForm
        memberId={member.id}
        contactOnly={contactOnly}
        backHref={back}
        member={{
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email,
          phone: member.phone,
          dateOfBirth: member.dateOfBirth?.toISOString() ?? null,
          address: member.address,
          occupation: member.occupation,
          emergencyName: member.emergencyName,
          emergencyPhone: member.emergencyPhone,
          sede: member.sede,
          secondarySede: member.secondarySede,
          notes: member.notes,
        }}
      />
    </FormPage>
  );
}
