import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getNutritionTips } from "@/lib/actions/nutrition";
import { TipsManager } from "./tips-manager";

export const dynamic = "force-dynamic";

export default async function NutricionDashboardPage() {
  const user = await requireAuth();
  if (!can.editBodyComp(user)) redirect("/dashboard");

  const tips = await getNutritionTips();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nutrición</h1>
        <p className="text-sm text-muted-foreground">
          Cápsulas de consejos que los socios ven en su app. Reemplaza compartirlas por WhatsApp.
        </p>
      </div>
      <TipsManager
        tips={tips.map((t) => ({
          id: t.id,
          title: t.title,
          body: t.body,
          sede: t.sede,
          active: t.active,
        }))}
      />
    </div>
  );
}
