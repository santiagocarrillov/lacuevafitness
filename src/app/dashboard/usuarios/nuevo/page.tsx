import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { InviteUserForm } from "../invite-user-form";

export const dynamic = "force-dynamic";

export default async function NuevoUsuarioPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.manageUsers(user)) redirect("/dashboard?forbidden=1");
  const { volver } = await searchParams;

  return (
    <FormPage title="Invitar usuario" description="Se creará una cuenta con contraseña temporal.">
      <InviteUserForm backHref={safeBack(volver, "/dashboard/usuarios")} />
    </FormPage>
  );
}
