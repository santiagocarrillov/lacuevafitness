import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getLead } from "@/lib/actions/leads";
import { getMembershipPlans } from "@/lib/actions/members";
import { FormPage } from "@/app/dashboard/form-page";
import { ConvertForm } from "./convert-form";

export const dynamic = "force-dynamic";

/** Convertir un lead en socio: elegir el plan que contrató (antes era una ventana en la tabla). */
export default async function ConvertLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");
  const lead = await getLead(id);
  if (!lead) return notFound();
  if (lead.member) redirect(`/dashboard/socios/${lead.member.id}`);
  const plans = (await getMembershipPlans()).filter((p) => p.sede == null || p.sede === lead.sede);
  const name = `${lead.firstName} ${lead.lastName ?? ""}`.trim();

  return (
    <FormPage
      title="Convertir a socio"
      description={
        <>
          Elige el plan que contrató <strong>{name}</strong>. Se crea su ficha de socio con el lead vinculado: la historia (cómo
          llegó, conversaciones, contactos) sigue en la misma ficha.
        </>
      }
    >
      <ConvertForm
        leadId={lead.id}
        backHref={`/dashboard/leads/${lead.id}`}
        plans={plans.map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, durationDays: p.durationDays }))}
      />
    </FormPage>
  );
}
