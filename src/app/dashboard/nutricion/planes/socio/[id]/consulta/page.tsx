import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getMemberPlanForEdit } from "@/lib/actions/meal-plans";
import { searchFoods } from "@/lib/actions/foods";
import { scaleFood } from "@/lib/nutrition/nutrients";
import type { PlanItem } from "@/lib/nutrition/plan-schema";
import { ConsultView, type QuickExtra } from "@/components/nutrition/plan-editor/consult-view";

export const dynamic = "force-dynamic";

// The "hidden calories" the nutritionist asks about: how is it cooked, what goes in the coffee…
// Values per the usual household measure; the food DB wins when it has the food.
const EXTRAS: { term: string; label: string; grams: number; fallback: Omit<PlanItem, "name" | "grams" | "portionLabel"> }[] = [
  { term: "aceite", label: "1 cda de aceite", grams: 14, fallback: { kcal: 124, proteinG: 0, carbsG: 0, fatG: 14 } },
  { term: "mantequilla", label: "1 cda de mantequilla", grams: 14, fallback: { kcal: 100, proteinG: 0.1, carbsG: 0, fatG: 11.4 } },
  { term: "azucar", label: "1 cdta de azúcar", grams: 4, fallback: { kcal: 16, proteinG: 0, carbsG: 4, fatG: 0 } },
  { term: "mayonesa", label: "1 cda de mayonesa", grams: 14, fallback: { kcal: 94, proteinG: 0.1, carbsG: 0.1, fatG: 10.3 } },
  { term: "queso", label: "1 tajada de queso", grams: 20, fallback: { kcal: 70, proteinG: 4.5, carbsG: 0.4, fatG: 5.5 } },
  { term: "miel", label: "1 cda de miel", grams: 21, fallback: { kcal: 64, proteinG: 0.1, carbsG: 17, fatG: 0 } },
  { term: "leche entera", label: "½ taza de leche", grams: 120, fallback: { kcal: 73, proteinG: 3.8, carbsG: 5.8, fatG: 3.9 } },
  { term: "pan blanco", label: "1 pan", grams: 40, fallback: { kcal: 106, proteinG: 3.5, carbsG: 20, fatG: 1.3 } },
];

export default async function ConsultaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { id } = await params;
  const p = await getMemberPlanForEdit(id);
  if (!p) notFound();

  const extras: QuickExtra[] = await Promise.all(
    EXTRAS.map(async (x) => {
      const hit = (await searchFoods(x.term, 5)).find((f) => f.verified && f.active);
      const m = hit ? scaleFood(hit, x.grams) : x.fallback;
      return {
        label: x.label,
        item: {
          foodId: hit?.id ?? null,
          recipeId: null,
          name: hit ? hit.name : x.label.replace(/^\S+ (de )?/, ""),
          grams: x.grams,
          servings: null,
          portionLabel: x.label,
          kcal: Math.round(m.kcal),
          proteinG: Math.round(m.proteinG * 10) / 10,
          carbsG: Math.round(m.carbsG * 10) / 10,
          fatG: Math.round(m.fatG * 10) / 10,
        },
      };
    }),
  );

  return (
    <ConsultView
      id={p.id}
      title={p.title}
      member={p.member}
      memberTarget={p.memberTarget}
      content={p.content}
      published={!!p.publishedAt}
      extras={extras}
    />
  );
}
