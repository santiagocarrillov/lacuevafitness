import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { PointForm } from "../../config";

export default async function NuevoPuntoPage() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  return (
    <FormPage title="Nuevo punto de emisión" description="Usa un punto propio para la app, distinto del que usa Ecuafact, para que la numeración no choque.">
      <PointForm />
    </FormPage>
  );
}
