"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveMyRecipe,
  saveMyRecipe,
  searchFoodsForMyRecipe,
  submitMyRecipe,
  withdrawMyRecipe,
  type IngredientFood,
} from "@/lib/actions/member-recipes";
import { recipePerServing } from "@/lib/nutrition/nutrients";
import { MEAL_KEYS, MEAL_LABEL, isMealKey } from "@/lib/nutrition/meals";
import { useDebouncedSearch } from "@/components/nutrition/use-debounced-search";
import { PhotoUpload } from "@/components/nutrition/photo-upload";
import { youtubeEmbed, youtubeThumb } from "@/lib/nutrition/video";
import { SheetHeader, inputStyle, primaryBtn, sheetStyle } from "./add-food-sheet";

export type PortalRecipe = {
  id: string;
  title: string;
  description: string | null;
  instructions: string;
  servings: number;
  prepMinutes: number | null;
  mealKeys: string[];
  photoUrl: string | null;
  videoId: string | null; // YouTube video of the recipe (library recipes)
  tags: string[];
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  status: "PRIVATE" | "SUBMITTED" | "PUBLISHED" | "REJECTED";
  reviewNote: string | null;
  author: string | null; // "de Ana P." for socio recipes in the library
  mine: boolean;
  ingredients: { label: string; grams: number | null; food: IngredientFood | null }[];
};

const STATUS: Record<PortalRecipe["status"], { label: string; cls: string }> = {
  PRIVATE: { label: "Solo tú", cls: "gray" },
  SUBMITTED: { label: "En revisión", cls: "yellow" },
  PUBLISHED: { label: "Publicada", cls: "green" },
  REJECTED: { label: "No aprobada", cls: "red" },
};

function RecipeCard({ r, onEdit }: { r: PortalRecipe; onEdit?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo.");
      }
    });
  const meals = r.mealKeys.filter(isMealKey).map((k) => MEAL_LABEL[k]);
  const cover = r.photoUrl ?? (r.videoId ? youtubeThumb(r.videoId) : null);
  // Mount the player only once opened — a closed card costs one thumbnail.
  const [open, setOpen] = useState(false);

  return (
    <details className="portal-card" style={{ padding: 0, overflow: "hidden" }} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary style={{ cursor: "pointer", listStyle: "none" }}>
        {cover && (
          <div style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" loading="lazy" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
            {r.videoId && (
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  bottom: 10,
                  background: "rgba(0,0,0,.72)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 12,
                }}
              >
                ▶ Video
              </span>
            )}
          </div>
        )}
        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{r.title}</span>
            <span style={{ fontSize: 12, color: "var(--pt-ink-3)", whiteSpace: "nowrap" }}>{Math.round(r.kcal)} kcal</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--pt-ink-3)", marginTop: 2 }}>
            P {r.proteinG} · C {r.carbsG} · G {r.fatG} por porción
            {meals.length > 0 && ` · ${meals.join(", ")}`}
            {r.author && ` · ${r.author}`}
          </div>
          {r.mine && (
            <span className={`portal-status-pill ${STATUS[r.status].cls}`} style={{ marginTop: 8 }}>
              {STATUS[r.status].label}
            </span>
          )}
        </div>
      </summary>
      <div style={{ padding: "0 14px 14px" }}>
        {r.mine && r.reviewNote && (
          <div className="portal-card-alt" style={{ padding: 10, marginBottom: 10, fontSize: 13 }}>
            <strong>Tu nutricionista:</strong> {r.reviewNote}
          </div>
        )}
        {open && r.videoId && (
          <div style={{ position: "relative", paddingTop: "56.25%", margin: "0 -14px 12px", background: "#000" }}>
            <iframe
              src={youtubeEmbed(r.videoId)}
              title={r.title}
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        )}
        {r.description && <p style={{ fontSize: 13, color: "var(--pt-ink-2)", marginTop: 0 }}>{r.description}</p>}
        <div className="portal-kicker" style={{ marginTop: 6 }}>
          Ingredientes {r.servings > 1 ? `(${r.servings} porciones)` : ""}
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: "grid", gap: 2 }}>
          {r.ingredients.map((i, k) => (
            <li key={k}>
              {i.label}
              {i.grams && !/\d/.test(i.label) ? ` · ${i.grams} g` : ""}
            </li>
          ))}
        </ul>
        {r.instructions && (
          <>
            <div className="portal-kicker" style={{ marginTop: 10 }}>
              Preparación {r.prepMinutes ? `· ${r.prepMinutes} min` : ""}
            </div>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{r.instructions}</p>
          </>
        )}
        {r.mine && r.status !== "PUBLISHED" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            {r.status === "SUBMITTED" ? (
              <button type="button" disabled={pending} onClick={() => act(() => withdrawMyRecipe(r.id))} style={linkBtn}>
                Retirar de revisión
              </button>
            ) : (
              <>
                <button type="button" disabled={pending} onClick={onEdit} style={linkBtn}>
                  Editar
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => submitMyRecipe(r.id))} style={{ ...linkBtn, fontWeight: 700 }}>
                  Enviar a mi nutricionista
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => confirm("¿Borrar esta receta?") && act(() => archiveMyRecipe(r.id))}
                  style={{ ...linkBtn, color: "var(--pt-red)" }}
                >
                  Borrar
                </button>
              </>
            )}
          </div>
        )}
        {error && <p style={{ color: "var(--pt-red)", fontSize: 12 }}>{error}</p>}
      </div>
    </details>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 13,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
  color: "var(--pt-ink)",
};

type Ing = { key: number; label: string; grams: string; food: IngredientFood | null };

function RecipeEditorSheet({ recipe, onClose }: { recipe: PortalRecipe | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [instructions, setInstructions] = useState(recipe?.instructions ?? "");
  const [servings, setServings] = useState(String(recipe?.servings ?? 1));
  const [prep, setPrep] = useState(recipe?.prepMinutes ? String(recipe.prepMinutes) : "");
  const [mealKeys, setMealKeys] = useState<string[]>(recipe?.mealKeys ?? []);
  const [photoUrl, setPhotoUrl] = useState<string | null>(recipe?.photoUrl ?? null);
  const [ings, setIngs] = useState<Ing[]>(
    (recipe?.ingredients ?? []).map((i, k) => ({ key: k, label: i.label, grams: i.grams ? String(i.grams) : "", food: i.food })),
  );
  const [q, setQ] = useState("");
  const { results } = useDebouncedSearch(q, searchFoodsForMyRecipe);

  const macros = useMemo(
    () => recipePerServing(ings.map((i) => ({ grams: Number(i.grams) || null, food: i.food })), Number(servings) || 1),
    [ings, servings],
  );

  function save(submit: boolean) {
    startTransition(async () => {
      try {
        const { id } = await saveMyRecipe(recipe?.id ?? null, {
          title,
          description,
          instructions,
          servings: Number(servings),
          prepMinutes: prep ? Number(prep) : null,
          mealKeys,
          photoUrl,
          macrosFromIngredients: true,
          ingredients: ings.map((i) => ({ foodId: i.food?.id ?? null, label: i.label, grams: Number(i.grams) || null })),
        });
        if (submit) await submitMyRecipe(id);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  const label = { display: "grid", gap: 6, fontSize: 13, color: "var(--pt-ink-2)" } as const;

  return (
    <div style={sheetStyle}>
      <SheetHeader title={recipe ? "Editar receta" : "Nueva receta"} onClose={onClose} />
      <div style={{ padding: 16, display: "grid", gap: 12, overflowY: "auto", flex: 1, background: "var(--pt-bg-card)" }}>
        <label style={label}>
          Nombre
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Tortilla de claras con espinaca" />
        </label>
        <PhotoUpload value={photoUrl} onChange={setPhotoUrl} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={label}>
            Porciones
            <input style={inputStyle} inputMode="numeric" value={servings} onChange={(e) => setServings(e.target.value)} />
          </label>
          <label style={label}>
            Minutos
            <input style={inputStyle} inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {MEAL_KEYS.map((k) => {
            const on = mealKeys.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMealKeys((m) => (on ? m.filter((x) => x !== k) : [...m, k]))}
                style={{
                  padding: "6px 11px",
                  borderRadius: 20,
                  fontSize: 12,
                  border: "1px solid var(--pt-line)",
                  background: on ? "var(--pt-ink)" : "transparent",
                  color: on ? "#fff" : "var(--pt-ink-2)",
                  cursor: "pointer",
                }}
              >
                {MEAL_LABEL[k]}
              </button>
            );
          })}
        </div>

        <div>
          <div className="portal-kicker">Ingredientes</div>
          <div style={{ display: "grid", gap: 6 }}>
            {ings.map((i) => (
              <div key={i.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ flex: 1, fontSize: 14 }}>
                  {i.food ? (
                    i.food.name
                  ) : (
                    <input
                      style={{ ...inputStyle, padding: "8px 10px" }}
                      value={i.label}
                      onChange={(e) => setIngs((xs) => xs.map((x) => (x.key === i.key ? { ...x, label: e.target.value } : x)))}
                    />
                  )}
                </div>
                <input
                  style={{ ...inputStyle, width: 72, padding: "8px 10px" }}
                  inputMode="decimal"
                  placeholder="g"
                  value={i.grams}
                  onChange={(e) => setIngs((xs) => xs.map((x) => (x.key === i.key ? { ...x, grams: e.target.value.replace(",", ".") } : x)))}
                />
                <button type="button" onClick={() => setIngs((xs) => xs.filter((x) => x.key !== i.key))} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }} aria-label="Quitar">
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", marginTop: 8 }}>
            <input style={inputStyle} placeholder="+ Buscar ingrediente…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q.trim().length >= 2 && (
              <div className="portal-card" style={{ position: "absolute", zIndex: 5, left: 0, right: 0, marginTop: 4, padding: 0, maxHeight: 240, overflowY: "auto" }}>
                {results.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setIngs((xs) => [...xs, { key: Date.now(), label: f.name, grams: String(f.portions[0]?.grams ?? 100), food: f }]);
                      setQ("");
                    }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", borderBottom: "1px solid var(--pt-line-soft)", cursor: "pointer", fontSize: 14 }}
                  >
                    {f.name} <span style={{ fontSize: 11, color: "var(--pt-ink-3)" }}>· {Math.round(f.kcal)} kcal/100 g</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIngs((xs) => [...xs, { key: Date.now(), label: q.trim(), grams: "", food: null }]);
                    setQ("");
                  }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--pt-ink-2)" }}
                >
                  Agregar “{q.trim()}” sin datos nutricionales
                </button>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--pt-ink-3)", marginTop: 8 }}>
            Por porción: <strong style={{ color: "var(--pt-ink)" }}>{macros.perServing.kcal} kcal</strong> · P {macros.perServing.proteinG} · C{" "}
            {macros.perServing.carbsG} · G {macros.perServing.fatG}
            {macros.computed < macros.ingredients && " (algunos ingredientes no suman)"}
          </div>
        </div>

        <label style={label}>
          Descripción
          <textarea rows={2} style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label style={label}>
          Preparación
          <textarea rows={5} style={inputStyle} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Un paso por línea" />
        </label>
        {error && <p style={{ color: "var(--pt-red)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="button" disabled={pending} onClick={() => save(false)} style={{ ...primaryBtn, background: "var(--pt-bg-card)", color: "var(--pt-ink)", border: "1px solid var(--pt-ink)" }}>
          Guardar (solo para mí)
        </button>
        <button type="button" disabled={pending} onClick={() => save(true)} style={primaryBtn}>
          Guardar y enviar a mi nutricionista
        </button>
        <p style={{ fontSize: 12, color: "var(--pt-ink-3)", margin: 0 }}>
          Si la aprueba, entra al recetario de La Cueva con tu nombre. Mientras tanto la puedes usar en tu diario.
        </p>
      </div>
    </div>
  );
}

export function RecipesTab({ library, mine }: { library: PortalRecipe[]; mine: PortalRecipe[] }) {
  const [editing, setEditing] = useState<PortalRecipe | "new" | null>(null);
  const [filter, setFilter] = useState<string>("todas");
  // Chips: meals, then the library's most common tags ("batidos verdes", "ecuatoriana"…).
  const topTags = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of library) for (const t of r.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  }, [library]);
  const shown =
    filter === "todas"
      ? library
      : filter.startsWith("#")
        ? library.filter((r) => r.tags.includes(filter.slice(1)))
        : library.filter((r) => r.mealKeys.includes(filter));
  const chipLabel = (k: string) =>
    k === "todas" ? "Todas" : k.startsWith("#") ? k.charAt(1).toUpperCase() + k.slice(2) : MEAL_LABEL[k as keyof typeof MEAL_LABEL];

  return (
    <div>
      <div className="portal-section-title" style={{ marginTop: 0 }}>
        <h4>Mis recetas</h4>
        <button type="button" onClick={() => setEditing("new")} style={{ ...linkBtn, fontSize: 12 }}>
          + Nueva receta
        </button>
      </div>
      {mine.length === 0 ? (
        <div className="portal-card-alt" style={{ fontSize: 13, color: "var(--pt-ink-2)", marginBottom: 12 }}>
          ¿Tienes una receta fit que te encanta? Súbela con foto: la usas en tu diario y, si tu nutricionista la aprueba, entra al
          recetario de todos.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          {mine.map((r) => (
            <RecipeCard key={r.id} r={r} onEdit={() => setEditing(r)} />
          ))}
        </div>
      )}

      <div className="portal-section-title">
        <h4>Recetario La Cueva</h4>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10 }}>
        {["todas", ...MEAL_KEYS, ...topTags.map((t) => `#${t}`)].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            style={{
              padding: "5px 11px",
              borderRadius: 20,
              fontSize: 12,
              whiteSpace: "nowrap",
              border: "1px solid var(--pt-line)",
              background: filter === k ? "var(--pt-ink)" : "transparent",
              color: filter === k ? "#fff" : "var(--pt-ink-2)",
              cursor: "pointer",
            }}
          >
            {chipLabel(k)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="portal-card" style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
          Pronto: el recetario de La Cueva.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {shown.map((r) => (
            <RecipeCard key={r.id} r={r} />
          ))}
        </div>
      )}

      {editing && <RecipeEditorSheet recipe={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
