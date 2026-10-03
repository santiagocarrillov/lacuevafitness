import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormPage } from "@/app/dashboard/form-page";
import { PointForm } from "../../config";

export const dynamic = "force-dynamic";

export default async function EditarPuntoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { id } = await params;
  const p = await prisma.emissionPoint.findUnique({ where: { id } });
  if (!p) notFound();
  return (
    <FormPage title={`Punto de emisión ${p.establishment}-${p.point}`} description="Si ya tiene facturas, no se puede cambiar su numeración ni su ambiente: crea uno nuevo.">
      <PointForm point={{ id: p.id, sede: p.sede, establishment: p.establishment, point: p.point, address: p.address, lastSequential: p.lastSequential, environment: p.environment, active: p.active }} />
    </FormPage>
  );
}
