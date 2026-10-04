import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { SupplierForm } from "../supplier-form";
import { supplierAccountOptions } from "../accounts";

export const dynamic = "force-dynamic";

export default async function NuevoProveedorPage() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  return (
    <FormPage title="Nuevo proveedor" description="No hace falta crearlos antes: cada gasto agrega su proveedor solo. Aquí se completan sus datos." wide>
      <SupplierForm accounts={await supplierAccountOptions()} />
    </FormPage>
  );
}
