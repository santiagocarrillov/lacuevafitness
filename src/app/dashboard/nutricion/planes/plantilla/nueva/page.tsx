import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { safeBack } from "@/lib/safe-back";
import { NutritionFormPage } from "../../../nutrition-form-page";
import { NewTemplateForm } from "../../plan-forms";

export const dynamic = "force-dynamic";

export default async function NuevaPlantillaPage({ searchParams }: { searchParams: Promise<{ volver?: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { volver } = await searchParams;
  return (
    <NutritionFormPage
      title="Nueva plantilla"
      description="Una base por nivel calórico que después asignas (y reescalas) a cada socio."
    >
      <NewTemplateForm backHref={safeBack(volver, "/dashboard/nutricion/planes")} />
    </NutritionFormPage>
  );
}
