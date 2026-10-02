import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "../../../form-page";
import { ItemForm } from "../../config";

export const dynamic = "force-dynamic";

export default async function EditarItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const s = await prisma.saleItem.findUnique({ where: { id } });
  if (!s) notFound();
  return (
    <FormPage title={s.name} description="Producto o servicio del catálogo de facturación.">
      <ItemForm item={{ id: s.id, sede: s.sede, name: s.name, priceCents: s.priceCents, ivaRate: s.ivaRate, kind: s.kind, incomeAccountCode: s.incomeAccountCode, active: s.active }} />
    </FormPage>
  );
}
