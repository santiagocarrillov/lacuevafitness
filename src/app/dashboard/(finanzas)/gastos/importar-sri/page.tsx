import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { FormPage } from "@/app/dashboard/form-page";
import { SriImportPanel } from "../../finanzas/sri-forms";

export const dynamic = "force-dynamic";

export default async function ImportarSriPage() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  return (
    <FormPage
      wide
      title="Facturas recibidas del SRI"
      description="Sube los XML (del correo o de SRI en Línea › Comprobantes electrónicos recibidos). Cada factura queda como gasto con su IVA; si ya entró el débito del banco por el mismo monto, se enlaza a ese gasto."
    >
      <SriImportPanel />
    </FormPage>
  );
}
