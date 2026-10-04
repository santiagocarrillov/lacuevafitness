import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { PayerForm } from "../../payer-form";

export const dynamic = "force-dynamic";

export default async function EditarPagadorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.viewPayments(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const p = await prisma.payer.findUnique({ where: { id } });
  if (!p) notFound();
  return (
    <FormPage title={`Editar ${p.name}`} description="Los cambios valen para las próximas facturas; las ya emitidas no cambian.">
      <PayerForm
        after={`/dashboard/finanzas/pagadores/${p.id}`}
        initial={{ id: p.id, name: p.name, taxIdType: p.taxIdType, taxId: p.taxId, email: p.email ?? "", phone: p.phone ?? "", address: p.address ?? "", notes: p.notes ?? "" }}
      />
    </FormPage>
  );
}
