import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { getRecipeForEdit } from "@/lib/actions/recipes";
import { parsePortions } from "@/lib/nutrition/nutrients";
import { RecipeEditor, type EditorRecipe } from "./recipe-editor";

export const dynamic = "force-dynamic";

export default async function RecipeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const { id } = await params;

  let recipe: EditorRecipe | null = null;
  if (id !== "nueva") {
    const r = await getRecipeForEdit(id);
    if (!r) notFound();
    recipe = {
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      instructions: r.instructions,
      servings: r.servings,
      prepMinutes: r.prepMinutes,
      tags: r.tags,
      mealKeys: r.mealKeys,
      status: r.status,
      reviewNote: r.reviewNote,
      active: r.active,
      sourceUrl: r.sourceUrl,
      photoUrl: r.photoUrl,
      author: r.authorMember ? `${r.authorMember.firstName} ${r.authorMember.lastName}` : null,
      macrosFromIngredients: r.macrosFromIngredients,
      manual: { kcal: r.kcal, proteinG: r.proteinG, carbsG: r.carbsG, fatG: r.fatG, fiberG: r.fiberG },
      ingredients: r.ingredients.map((i) => ({
        key: i.id,
        label: i.label,
        grams: i.grams,
        food: i.food ? { ...i.food, portions: parsePortions(i.food.portions) } : null,
      })),
    };
  }

  return (
    <div className="space-y-4">
      <Link href="/dashboard/nutricion/recetas" className="text-sm text-muted-foreground hover:underline">
        ← Recetas
      </Link>
      <RecipeEditor recipe={recipe} />
    </div>
  );
}
