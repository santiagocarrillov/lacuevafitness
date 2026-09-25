import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getTemplateForEdit } from "@/lib/actions/meal-plans";
import { PlanEditor } from "@/components/nutrition/plan-editor/plan-editor";

export const dynamic = "force-dynamic";

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { id } = await params;
  const t = await getTemplateForEdit(id);
  if (!t) notFound();
  return (
    <div className="space-y-3">
      <Link href="/dashboard/nutricion/planes" className="text-sm text-muted-foreground hover:underline">
        ← Planes
      </Link>
      <PlanEditor mode="template" id={t.id} name={t.name} calorieLevel={t.calorieLevel} notes={t.notes} content={t.content} />
    </div>
  );
}
