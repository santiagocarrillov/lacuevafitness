"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FoodPicker } from "@/components/nutrition/food-picker";
import { PhotoUpload } from "@/components/nutrition/photo-upload";
import { saveRecipe, setRecipeActive, setRecipeStatus, type RecipeInput } from "@/lib/actions/recipes";
import { MEAL_KEYS, MEAL_LABEL } from "@/lib/nutrition/meals";
import { recipePerServing, scaleFood, type Portion } from "@/lib/nutrition/nutrients";

type Status = "PRIVATE" | "SUBMITTED" | "PUBLISHED" | "REJECTED";

type EditorFood = {
  id: string;
  name: string;
  brand: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  portions: Portion[];
};

type Ingredient = { key: string; label: string; grams: number | null; food: EditorFood | null };

export type EditorRecipe = {
  id: string;
  title: string;
  description: string;
  instructions: string;
  servings: number;
  prepMinutes: number | null;
  tags: string[];
  mealKeys: string[];
  status: Status;
  reviewNote: string | null;
  active: boolean;
  sourceUrl: string | null;
  photoUrl: string | null;
  author: string | null;
  macrosFromIngredients: boolean;
  manual: { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number | null };
  ingredients: Ingredient[];
};

const STATUS_LABEL: Record<Status, string> = {
  PRIVATE: "Borrador",
  SUBMITTED: "Por revisar",
  PUBLISHED: "Publicada",
  REJECTED: "Rechazada",
};

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

export function RecipeEditor({ recipe }: { recipe: EditorRecipe | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [instructions, setInstructions] = useState(recipe?.instructions ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 1));
  const [prep, setPrep] = useState(recipe?.prepMinutes ? String(recipe.prepMinutes) : "");
  const [tags, setTags] = useState((recipe?.tags ?? []).join(", "));
  const [mealKeys, setMealKeys] = useState<string[]>(recipe?.mealKeys ?? []);
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe?.ingredients ?? []);
  const [fromIngredients, setFromIngredients] = useState(recipe?.macrosFromIngredients ?? true);
  const [manual, setManual] = useState(() => ({
    kcal: String(recipe?.manual.kcal ?? ""),
    proteinG: String(recipe?.manual.proteinG ?? ""),
    carbsG: String(recipe?.manual.carbsG ?? ""),
    fatG: String(recipe?.manual.fatG ?? ""),
  }));
  const [reviewNote, setReviewNote] = useState(recipe?.reviewNote ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(recipe?.photoUrl ?? null);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);

  const computed = useMemo(
    () => recipePerServing(ingredients.map((i) => ({ grams: i.grams, food: i.food })), Number(servings) || 1),
    [ingredients, servings],
  );

  function updateIng(key: string, patch: Partial<Ingredient>) {
    setIngredients((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function addFood(food: EditorFood) {
    const grams = food.portions[0]?.grams ?? 100;
    setIngredients((xs) => [...xs, { key: newKey(), label: food.name, grams, food }]);
  }

  function buildInput(): RecipeInput {
    return {
      title,
      description,
      instructions,
      servings: Number(servings),
      prepMinutes: prep ? Number(prep) : null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      mealKeys,
      photoUrl,
      macrosFromIngredients: fromIngredients,
      manual: {
        kcal: Number(manual.kcal),
        proteinG: Number(manual.proteinG),
        carbsG: Number(manual.carbsG),
        fatG: Number(manual.fatG),
      },
      ingredients: ingredients.map((i) => ({ foodId: i.food?.id ?? null, label: i.label, grams: i.grams })),
    };
  }

  function save(then?: (id: string) => Promise<void>, okMsg = "Receta guardada.") {
    startTransition(async () => {
      try {
        const { id } = await saveRecipe(recipe?.id ?? null, buildInput());
        if (then) await then(id);
        toast.success(okMsg);
        if (!recipe) router.replace(`/dashboard/nutricion/recetas/${id}`);
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  const unlinked = ingredients.filter((i) => !i.food || !i.grams).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="r-title">Título</Label>
              <Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Bowl de quinua con pollo" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-desc">Descripción</Label>
              <textarea
                id="r-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label htmlFor="r-serv">Porciones</Label>
                <Input id="r-serv" inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="r-prep">Minutos</Label>
                <Input id="r-prep" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="r-tags">Etiquetas</Label>
                <Input id="r-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="dulce, vegetariano" />
              </div>
            </div>
            <PhotoUpload value={photoUrl} onChange={setPhotoUrl} />
            <div className="flex flex-wrap gap-3 text-sm">
              {MEAL_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={mealKeys.includes(k)}
                    onChange={(e) =>
                      setMealKeys((ms) => (e.target.checked ? [...ms, k] : ms.filter((m) => m !== k)))
                    }
                  />
                  {MEAL_LABEL[k]}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingredientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ingredients.map((ing) => {
              const m = ing.food && ing.grams ? scaleFood(ing.food, ing.grams) : null;
              return (
                <div key={ing.key} className="rounded-md border p-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="flex-1 min-w-48"
                      value={ing.label}
                      onChange={(e) => updateIng(ing.key, { label: e.target.value })}
                    />
                    <Input
                      className="w-24"
                      inputMode="decimal"
                      placeholder="g"
                      value={ing.grams ?? ""}
                      onChange={(e) => updateIng(ing.key, { grams: e.target.value ? Number(e.target.value.replace(",", ".")) : null })}
                    />
                    {ing.food && ing.food.portions.length > 0 && (
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                        value=""
                        onChange={(e) => e.target.value && updateIng(ing.key, { grams: Number(e.target.value) })}
                      >
                        <option value="">Porción…</option>
                        {ing.food.portions.map((p) => (
                          <option key={p.label} value={p.grams}>
                            {p.label} ({p.grams} g)
                          </option>
                        ))}
                      </select>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIngredients((xs) => xs.filter((x) => x.key !== ing.key))}
                    >
                      ✕
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {ing.food ? (
                      <>
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">↔ {ing.food.name}</span>
                        {m && (
                          <span className="tabular-nums">
                            {m.kcal} kcal · P {m.proteinG} · C {m.carbsG} · G {m.fatG}
                          </span>
                        )}
                        <button type="button" className="hover:underline" onClick={() => updateIng(ing.key, { food: null })}>
                          desenlazar
                        </button>
                      </>
                    ) : linkingKey === ing.key ? (
                      <div className="w-full">
                        <FoodPicker
                          autoFocus
                          placeholder="Enlazar con un alimento…"
                          onPick={(f) => {
                            updateIng(ing.key, { food: f, grams: ing.grams ?? f.portions[0]?.grams ?? 100 });
                            setLinkingKey(null);
                          }}
                        />
                      </div>
                    ) : (
                      <button type="button" className="text-amber-700 hover:underline" onClick={() => setLinkingKey(ing.key)}>
                        Sin enlazar · enlazar con un alimento
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <div className="flex-1">
                <FoodPicker onPick={addFood} placeholder="+ Agregar ingrediente de la base…" />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIngredients((xs) => [...xs, { key: newKey(), label: "", grams: null, food: null }])}
              >
                + Ingrediente libre
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-1">
            <Label htmlFor="r-ins">Preparación</Label>
            <textarea
              id="r-ins"
              rows={8}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Un paso por línea"
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar: nutrition + review */}
      <div className="space-y-4 lg:sticky lg:top-4 self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por porción</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex rounded-md border border-input overflow-hidden text-xs">
              <button
                type="button"
                className={`flex-1 py-1.5 ${fromIngredients ? "bg-foreground text-background" : ""}`}
                onClick={() => setFromIngredients(true)}
              >
                Desde ingredientes
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 ${!fromIngredients ? "bg-foreground text-background" : ""}`}
                onClick={() => setFromIngredients(false)}
              >
                Manual
              </button>
            </div>
            {fromIngredients ? (
              <>
                <MacroGrid m={computed.perServing} />
                {unlinked > 0 && (
                  <p className="text-xs text-amber-700">
                    {unlinked} de {ingredients.length} ingredientes sin enlazar o sin gramos: no suman al total.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(["kcal", "proteinG", "carbsG", "fatG"] as const).map((k) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-xs">{{ kcal: "kcal", proteinG: "Proteína g", carbsG: "Carbos g", fatG: "Grasa g" }[k]}</Label>
                      <Input
                        inputMode="decimal"
                        value={manual[k]}
                        onChange={(e) => setManual((m) => ({ ...m, [k]: e.target.value.replace(",", ".") }))}
                      />
                    </div>
                  ))}
                </div>
                {computed.computed > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Según ingredientes enlazados: {computed.perServing.kcal} kcal · P {computed.perServing.proteinG} · C{" "}
                    {computed.perServing.carbsG} · G {computed.perServing.fatG}
                  </p>
                )}
              </>
            )}
            <Button className="w-full" disabled={isPending} onClick={() => save()}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
          </CardContent>
        </Card>

        {recipe && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {STATUS_LABEL[recipe.status]}
                {recipe.author && <span className="block text-xs font-normal text-muted-foreground">Enviada por {recipe.author}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recipe.sourceUrl && (
                <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="block text-xs text-muted-foreground hover:underline">
                  Ver publicación original ↗
                </a>
              )}
              <Label htmlFor="r-note" className="text-xs">Comentario de revisión</Label>
              <textarea
                id="r-note"
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={recipe.author ? "El socio verá este comentario" : "Nota interna"}
              />
              <div className="flex flex-wrap gap-2">
                {recipe.status !== "PUBLISHED" && (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => save((id) => setRecipeStatus(id, "PUBLISHED", reviewNote), "Publicada en el recetario.")}
                  >
                    Guardar y publicar
                  </Button>
                )}
                {recipe.status === "PUBLISHED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => save((id) => setRecipeStatus(id, "PRIVATE", reviewNote), "Retirada del recetario.")}
                  >
                    Retirar del recetario
                  </Button>
                )}
                {recipe.author && recipe.status === "SUBMITTED" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending || !reviewNote.trim()}
                      onClick={() => save((id) => setRecipeStatus(id, "PRIVATE", reviewNote), "Devuelta al socio con tu comentario.")}
                    >
                      Pedir cambios
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => save((id) => setRecipeStatus(id, "REJECTED", reviewNote), "Rechazada.")}
                    >
                      Rechazar
                    </Button>
                  </>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() =>
                  startTransition(async () => {
                    await setRecipeActive(recipe.id, !recipe.active);
                    toast.success(recipe.active ? "Archivada." : "Restaurada.");
                    router.push("/dashboard/nutricion/recetas");
                  })
                }
              >
                {recipe.active ? "Archivar receta" : "Restaurar receta"}
              </button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function MacroGrid({ m }: { m: { kcal: number; proteinG: number; carbsG: number; fatG: number } }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {[
        { l: "kcal", v: m.kcal },
        { l: "Prot", v: m.proteinG },
        { l: "Carb", v: m.carbsG },
        { l: "Grasa", v: m.fatG },
      ].map((x) => (
        <div key={x.l} className="rounded-md bg-muted/60 py-2">
          <p className="text-lg font-semibold tabular-nums">{x.v}</p>
          <p className="text-[10px] uppercase text-muted-foreground">{x.l}</p>
        </div>
      ))}
    </div>
  );
}
