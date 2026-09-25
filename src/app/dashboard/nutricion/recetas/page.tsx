import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { listRecipes, type RecipeListFilter } from "@/lib/actions/recipes";
import { MEAL_LABEL, isMealKey } from "@/lib/nutrition/meals";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const FILTERS: { key: RecipeListFilter; label: string; status?: string }[] = [
  { key: "por-revisar", label: "Por revisar", status: "SUBMITTED" },
  { key: "publicadas", label: "Publicadas", status: "PUBLISHED" },
  { key: "borradores", label: "Borradores", status: "PRIVATE" },
  { key: "rechazadas", label: "Rechazadas", status: "REJECTED" },
  { key: "todas", label: "Todas" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: "Por revisar", cls: "bg-amber-100 text-amber-800" },
  PUBLISHED: { label: "Publicada", cls: "bg-emerald-100 text-emerald-800" },
  PRIVATE: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
  REJECTED: { label: "Rechazada", cls: "bg-red-100 text-red-800" },
};

export default async function RecetasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string }>;
}) {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) redirect("/dashboard/nutricion");
  const params = await searchParams;
  const { rows: probe, countBy } = await listRecipes("por-revisar");
  // Land on the review queue when there is something to review.
  const filter =
    (FILTERS.find((f) => f.key === params.filtro)?.key as RecipeListFilter | undefined) ??
    (probe.length > 0 ? "por-revisar" : "publicadas");
  const { rows } = filter === "por-revisar" && !params.q ? { rows: probe } : await listRecipes(filter, params.q);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/dashboard/nutricion/recetas?filtro=${f.key}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f.key ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {f.label}
            {f.status && countBy[f.status as keyof typeof countBy] ? (
              <span className="ml-1 opacity-70">{countBy[f.status as keyof typeof countBy]}</span>
            ) : null}
          </Link>
        ))}
        <form className="ml-auto flex gap-2" action="/dashboard/nutricion/recetas">
          <input type="hidden" name="filtro" value={filter} />
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar receta…"
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
        </form>
        <Link
          href="/dashboard/nutricion/recetas/nueva"
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          + Nueva receta
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay recetas en esta lista.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((r) => (
            <Link key={r.id} href={`/dashboard/nutricion/recetas/${r.id}`}>
              <Card className="h-full hover:border-foreground/30 transition">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-tight">{r.title}</p>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${STATUS_BADGE[r.status].cls}`}>
                      {STATUS_BADGE[r.status].label}
                    </span>
                  </div>
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">{Math.round(r.kcal)} kcal</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · P {r.proteinG} · C {r.carbsG} · G {r.fatG} por porción
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      r.mealKeys.filter(isMealKey).map((k) => MEAL_LABEL[k]).join(", "),
                      r.authorMember ? `de ${r.authorMember.firstName} ${r.authorMember.lastName}` : null,
                      `${r._count.ingredients} ingredientes`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
