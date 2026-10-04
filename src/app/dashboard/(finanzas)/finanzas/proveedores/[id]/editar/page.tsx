import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { SupplierForm } from "../../supplier-form";
import { supplierAccountOptions } from "../../accounts";

export const dynamic = "force-dynamic";

export default async function EditarProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const s = await prisma.supplier.findUnique({ where: { id } });
  if (!s) notFound();
  return (
    <FormPage title={`Editar ${s.tradeName ?? s.name}`} description="Los gastos ya registrados conservan el nombre y RUC con que se registraron." wide>
      <SupplierForm
        accounts={await supplierAccountOptions()}
        initial={{
          id: s.id, name: s.name, tradeName: s.tradeName ?? "", taxIdType: s.taxIdType, taxId: s.taxId ?? "", email: s.email ?? "",
          phone: s.phone ?? "", address: s.address ?? "", contactName: s.contactName ?? "", defaultAccountCode: s.defaultAccountCode ?? "",
          paymentTermsDays: s.paymentTermsDays, notes: s.notes ?? "",
        }}
      />
    </FormPage>
  );
}
