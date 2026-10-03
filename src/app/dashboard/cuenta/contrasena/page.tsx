import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { ChangePasswordForm } from "../change-password-form";

export const dynamic = "force-dynamic";

export default async function CambiarContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  if (user.role === "MEMBER") redirect("/portal/hoy");
  const { volver } = await searchParams;

  return (
    <FormPage title="Cambiar contraseña" description="Crea una nueva contraseña para tu cuenta (mín. 8 caracteres).">
      <ChangePasswordForm backHref={safeBack(volver, "/dashboard")} />
    </FormPage>
  );
}
