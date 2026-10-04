import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { OtherIncomeForm } from "../../forms";

export const dynamic = "force-dynamic";

export default async function NuevoOtroIngresoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { mes } = await searchParams;
  const ym = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes : undefined;
  return (
    <FormPage title="Otro ingreso" description="Ventas de Gatorade y productos, reembolsos y otros ingresos que no son membresías.">
      <OtherIncomeForm defaultDate={ym && ym < ecuadorDateString().slice(0, 7) ? `${ym}-01` : undefined} backHref={`/dashboard/finanzas/otros-ingresos${ym ? `?mes=${ym}` : ""}`} />
    </FormPage>
  );
}
