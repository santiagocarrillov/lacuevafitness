import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { AccountForm } from "../../banco-forms";

export const dynamic = "force-dynamic";

export default async function NuevaCuentaBancariaPage() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  return (
    <FormPage title="Agregar cuenta bancaria" description="Una por cada cuenta de la que vas a subir estados de cuenta.">
      <AccountForm />
    </FormPage>
  );
}
