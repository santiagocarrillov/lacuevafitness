import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { listPlansOverview } from "@/lib/actions/meal-plans";
import { PlansOverview } from "./plans-overview";

export const dynamic = "force-dynamic";

export default async function PlanesPage({ searchParams }: { searchParams: Promise<{ socio?: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { socio } = await searchParams;
  // Old "?socio=<memberId>" links (socio file) now open the new-plan screen.
  if (socio) {
    const sp = new URLSearchParams({ socio, volver: `/dashboard/socios/${socio}` });
    redirect(`/dashboard/nutricion/planes/socio/nuevo?${sp.toString()}`);
  }
  const data = await listPlansOverview();
  return <PlansOverview {...data} />;
}
