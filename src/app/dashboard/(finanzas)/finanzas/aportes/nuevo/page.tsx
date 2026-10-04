import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { ecuadorDateString } from "@/lib/timezone";
import { FormPage } from "@/app/dashboard/form-page";
import { CapitalForm } from "../../forms";

export const dynamic = "force-dynamic";

export default async function NuevoAportePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireAuth();
  if (!can.editFinancials(user)) redirect("/dashboard?forbidden=1");
  const { mes } = await searchParams;
  const ym = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes : undefined;
  return (
    <FormPage title="Aporte o préstamo de los dueños" description="Dinero que tú o Isabel ponen para cubrir la caja (o que regresa a ustedes). No cuenta como ingreso.">
      <CapitalForm defaultDate={ym && ym < ecuadorDateString().slice(0, 7) ? `${ym}-01` : undefined} backHref={`/dashboard/finanzas/aportes${ym ? `?mes=${ym}` : ""}`} />
    </FormPage>
  );
}
