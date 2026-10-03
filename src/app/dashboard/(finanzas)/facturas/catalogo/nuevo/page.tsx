import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { ItemForm } from "../../config";

export default async function NuevoItemPage() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  return (
    <FormPage title="Nuevo producto o servicio" description="Lo que se vende y no es membresía: evaluaciones, bebidas, pases.">
      <ItemForm />
    </FormPage>
  );
}
