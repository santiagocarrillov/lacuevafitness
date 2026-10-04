import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { EmployeeForm } from "../employee-form";

export const dynamic = "force-dynamic";

export default async function NuevoTrabajadorPage() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  return (
    <FormPage title="Nuevo trabajador" description="Sus datos de contrato alimentan el rol de pagos de cada mes." wide>
      <EmployeeForm today={ecuadorDateString()} />
    </FormPage>
  );
}
