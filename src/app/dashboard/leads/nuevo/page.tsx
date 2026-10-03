import { redirect } from "next/navigation";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { safeBack } from "@/lib/safe-back";
import { NewLeadForm } from "../new-lead-form";

export const dynamic = "force-dynamic";

export default async function NuevoLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");
  const { volver } = await searchParams;
  const scope = getSedeScope(user);

  return (
    <FormPage title="Registrar lead" description="Nuevo prospecto por cualquier canal.">
      <NewLeadForm
        defaultSede={scope ?? user.sede ?? "FITNESS_CENTER"}
        canPickSede={!scope}
        backHref={safeBack(volver, "/dashboard/leads")}
      />
    </FormPage>
  );
}
