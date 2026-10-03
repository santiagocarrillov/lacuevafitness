import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { EditUserForm } from "../edit-user-form";

export const dynamic = "force-dynamic";

export default async function EditarUsuarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const actor = await requireAuth();
  if (!can.manageUsers(actor)) redirect("/dashboard?forbidden=1");
  const [{ id }, { volver }] = await Promise.all([params, searchParams]);

  // Same people as the staff table: socios' portal accounts live in their ficha.
  const user = await prisma.user.findFirst({
    where: { id, role: { not: "MEMBER" } },
    select: { id: true, fullName: true, email: true, role: true, sede: true, active: true },
  });
  if (!user) notFound();

  return (
    <FormPage title="Editar usuario" description={user.email}>
      <EditUserForm
        user={user}
        isSelf={user.id === actor.id}
        backHref={safeBack(volver, "/dashboard/usuarios")}
      />
    </FormPage>
  );
}
