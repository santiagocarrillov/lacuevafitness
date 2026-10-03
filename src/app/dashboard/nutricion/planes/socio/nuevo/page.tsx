import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPlansOverview } from "@/lib/actions/meal-plans";
import { safeBack } from "@/lib/safe-back";
import { NutritionFormPage } from "../../../nutrition-form-page";
import { NewMemberPlanForm } from "../../plan-forms";

export const dynamic = "force-dynamic";

export default async function NuevoPlanSocioPage({
  searchParams,
}: {
  searchParams: Promise<{ socio?: string; volver?: string }>;
}) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { socio, volver } = await searchParams;
  const [{ templates }, prefill] = await Promise.all([
    listPlansOverview(),
    socio
      ? prisma.member.findUnique({ where: { id: socio }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve(null),
  ]);
  return (
    <NutritionFormPage
      title="Plan para un socio"
      description="Se crea como borrador: el socio no lo ve hasta que lo publiques."
    >
      <NewMemberPlanForm
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        prefillMember={prefill}
        backHref={safeBack(volver, "/dashboard/nutricion/planes")}
      />
    </NutritionFormPage>
  );
}
