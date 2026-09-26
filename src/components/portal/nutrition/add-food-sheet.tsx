"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFoodLogEntry,
  addPlanOptionToDiary,
  getDiaryShortcuts,
  searchDiaryItems,
  type DiaryFood,
  type DiaryHit,
} from "@/lib/actions/food-log";
import { scaleFood } from "@/lib/nutrition/nutrients";
import { MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";
import { useDebouncedSearch } from "@/components/nutrition/use-debounced-search";
import type { PlanOptionVm } from "@/lib/portal/food-diary";
import { lookupBarcode } from "@/lib/actions/barcode";
import type { FoodInput } from "@/lib/nutrition/food-input";
import { BarcodeScanner } from "@/components/nutrition/barcode-scanner";
import { CreateFoodForm } from "./create-food-form";

export const sheetStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 60,
  background: "var(--pt-bg-page)",
  display: "flex",
  flexDirection: "column",
  maxWidth: 480,
  margin: "0 auto",
};

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid var(--pt-line)",
  fontSize: 15,
  fontFamily: "inherit",
  background: "var(--pt-bg-card)",
};

export const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  border: "none",
  background: "var(--pt-ink)",
  color: "#fff",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
};

export function SheetHeader({ title, onClose, onBack }: { title: string; onClose: () => void; onBack?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid var(--pt-line)", background: "var(--pt-bg-card)" }}>
      {onBack && (
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }} aria-label="Atrás">
          ‹
        </button>
      )}
      <div style={{ flex: 1, fontFamily: "var(--pt-font-cond)", fontSize: 18, fontWeight: 600, textTransform: "uppercase" }}>{title}</div>
      <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}

type Tab = "recientes" | "frecuentes" | "mios" | "plan" | "rapido";

function HitRow({ hit, onPick }: { hit: DiaryHit; onPick: () => void }) {
  const sub =
    hit.kind === "food"
      ? `${Math.round(hit.kcal)} kcal / 100 ${hit.isLiquid ? "ml" : "g"}${hit.brand ? ` · ${hit.brand}` : ""}${!hit.verified ? " · sin verificar" : ""}`
      : `${Math.round(hit.kcal)} kcal / porción · receta`;
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 16px", background: "none", border: "none", borderBottom: "1px solid var(--pt-line-soft)", cursor: "pointer" }}
    >
      <div style={{ fontSize: 15 }}>{hit.name}</div>
      <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>{sub}</div>
    </button>
  );
}

/** Amount step: grams or a household portion (foods), servings (recipes), with live macros. */
function AmountStep({
  hit,
  mealKey,
  date,
  onDone,
}: {
  hit: DiaryHit;
  mealKey: MealKey;
  date: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const food = hit.kind === "food" ? (hit as DiaryFood) : null;
  const firstPortion = food?.portions[0] ?? null;
  const [portionIdx, setPortionIdx] = useState<number>(food?.lastGrams ? -1 : firstPortion ? 0 : -1);
  const [count, setCount] = useState("1");
  const [grams, setGrams] = useState(String(food?.lastGrams ?? 100));
  const [servings, setServings] = useState(String(hit.kind === "recipe" ? hit.lastServings ?? 1 : 1));

  const g = food ? (portionIdx >= 0 ? food.portions[portionIdx].grams * (Number(count) || 0) : Number(grams) || 0) : 0;
  const s = hit.kind === "recipe" ? Number(servings) || 0 : 0;
  const m = food
    ? scaleFood(food, g)
    : { kcal: Math.round(hit.kcal * s), proteinG: Math.round(hit.proteinG * s * 10) / 10, carbsG: Math.round(hit.carbsG * s * 10) / 10, fatG: Math.round(hit.fatG * s * 10) / 10 };

  function add() {
    startTransition(async () => {
      try {
        await addFoodLogEntry({
          date,
          mealKey,
          foodId: food ? food.id : null,
          recipeId: food ? null : hit.id,
          grams: food ? g : null,
          servings: food ? null : s,
          portionLabel: food && portionIdx >= 0 ? `${Number(count) === 1 ? "" : `${count} × `}${food.portions[portionIdx].label}` : null,
        });
        router.refresh();
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar.");
      }
    });
  }

  const unit = food?.isLiquid ? "ml" : "g";

  return (
    <div style={{ padding: 16, display: "grid", gap: 14, overflowY: "auto" }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{hit.name}</div>
        <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>a {MEAL_LABEL[mealKey].toLowerCase()}</div>
      </div>

      {food ? (
        <>
          {food.portions.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {food.portions.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPortionIdx(i)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 20,
                    fontSize: 13,
                    border: "1px solid var(--pt-line)",
                    background: portionIdx === i ? "var(--pt-ink)" : "var(--pt-bg-card)",
                    color: portionIdx === i ? "#fff" : "var(--pt-ink)",
                    cursor: "pointer",
                  }}
                >
                  {p.label} · {p.grams} {unit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPortionIdx(-1)}
                style={{
                  padding: "7px 12px",
                  borderRadius: 20,
                  fontSize: 13,
                  border: "1px solid var(--pt-line)",
                  background: portionIdx === -1 ? "var(--pt-ink)" : "var(--pt-bg-card)",
                  color: portionIdx === -1 ? "#fff" : "var(--pt-ink)",
                  cursor: "pointer",
                }}
              >
                En {unit}
              </button>
            </div>
          )}
          {portionIdx >= 0 ? (
            <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--pt-ink-2)" }}>
              ¿Cuántas?
              <input style={inputStyle} inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value.replace(",", "."))} />
            </label>
          ) : (
            <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--pt-ink-2)" }}>
              Cantidad ({unit})
              <input style={inputStyle} inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value.replace(",", "."))} />
            </label>
          )}
        </>
      ) : (
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "var(--pt-ink-2)" }}>
          Porciones
          <input style={inputStyle} inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value.replace(",", "."))} />
        </label>
      )}

      <div className="portal-card" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", textAlign: "center", padding: 12 }}>
        {[
          { l: "kcal", v: m.kcal },
          { l: "Prot", v: m.proteinG },
          { l: "Carb", v: m.carbsG },
          { l: "Grasa", v: m.fatG },
        ].map((x) => (
          <div key={x.l}>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{x.v}</div>
            <div style={{ fontSize: 10, textTransform: "uppercase", color: "var(--pt-ink-3)" }}>{x.l}</div>
          </div>
        ))}
      </div>
      {error && <p style={{ color: "var(--pt-red)", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="button" disabled={pending || !(m.kcal > 0 || g > 0 || s > 0)} onClick={add} style={{ ...primaryBtn, opacity: pending ? 0.6 : 1 }}>
        {pending ? "Agregando…" : "Agregar"}
      </button>
    </div>
  );
}

function QuickAdd({ mealKey, date, onDone }: { mealKey: MealKey; date: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ padding: 16, display: "grid", gap: 10 }}>
      <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: 0 }}>
        ¿Comiste fuera y no encuentras el plato? Anota una estimación de calorías.
      </p>
      <input style={inputStyle} placeholder="Qué fue (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={inputStyle} placeholder="Calorías" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <input style={inputStyle} placeholder="Prot g" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
        <input style={inputStyle} placeholder="Carb g" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} />
        <input style={inputStyle} placeholder="Grasa g" inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      {error && <p style={{ color: "var(--pt-red)", fontSize: 13, margin: 0 }}>{error}</p>}
      <button
        type="button"
        disabled={pending || !(Number(kcal) > 0)}
        style={{ ...primaryBtn, opacity: pending || !(Number(kcal) > 0) ? 0.5 : 1 }}
        onClick={() =>
          startTransition(async () => {
            try {
              await addFoodLogEntry({ date, mealKey, quick: { name, kcal: Number(kcal), proteinG: Number(p), carbsG: Number(c), fatG: Number(f) } });
              router.refresh();
              onDone();
            } catch (e) {
              setError(e instanceof Error ? e.message : "No se pudo agregar.");
            }
          })
        }
      >
        Agregar {MEAL_LABEL[mealKey].toLowerCase()}
      </button>
    </div>
  );
}

export function AddFoodSheet({
  mealKey,
  date,
  isToday,
  planOptions,
  onClose,
}: {
  mealKey: MealKey;
  date: string;
  isToday: boolean;
  planOptions: PlanOptionVm[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("recientes");
  const [picked, setPicked] = useState<DiaryHit | null>(null);
  const [shortcuts, setShortcuts] = useState<{ recent: DiaryHit[]; frequent: DiaryHit[]; mine: DiaryHit[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const { results, loading, done } = useDebouncedSearch(q, searchDiaryItems);
  const [scanning, setScanning] = useState(false);
  const [creating, setCreating] = useState<{ prefill: Partial<FoodInput>; fromOff: boolean } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  async function onScanned(code: string) {
    setScanning(false);
    setLookingUp(true);
    setMsg(null);
    try {
      const r = await lookupBarcode(code);
      if (r.status === "found") setPicked(r.food);
      else if (r.status === "external") setCreating({ prefill: r.prefill, fromOff: true });
      else if (r.status === "unknown") setCreating({ prefill: { barcode: r.barcode }, fromOff: false });
      else setMsg("Ese código no parece de un producto. Intenta de nuevo.");
    } catch {
      setMsg("No se pudo buscar el código. Revisa tu conexión.");
    } finally {
      setLookingUp(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getDiaryShortcuts()
      .then((s) => {
        if (!cancelled) setShortcuts(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock page scroll behind the sheet.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const myPlan = planOptions.filter((o) => o.mealKey === mealKey);
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "recientes", label: "Recientes", show: true },
    { key: "frecuentes", label: "Frecuentes", show: true },
    { key: "mios", label: "Míos", show: true },
    { key: "plan", label: "Mi plan", show: isToday && myPlan.length > 0 },
    { key: "rapido", label: "Rápido", show: true },
  ];

  if (scanning) return <BarcodeScanner onDetected={onScanned} onClose={() => setScanning(false)} />;

  if (creating) {
    return (
      <div style={sheetStyle}>
        <SheetHeader title={creating.fromOff ? "Confirma el producto" : "Nuevo alimento"} onClose={onClose} onBack={() => setCreating(null)} />
        <CreateFoodForm
          prefill={creating.prefill}
          fromOpenFoodFacts={creating.fromOff}
          onCreated={(food) => {
            setCreating(null);
            setPicked(food);
          }}
        />
      </div>
    );
  }

  if (picked) {
    return (
      <div style={sheetStyle}>
        <SheetHeader title="Cantidad" onClose={onClose} onBack={() => setPicked(null)} />
        <AmountStep hit={picked} mealKey={mealKey} date={date} onDone={onClose} />
      </div>
    );
  }

  const list: DiaryHit[] =
    q.trim().length >= 2
      ? results
      : tab === "recientes"
        ? shortcuts?.recent ?? []
        : tab === "frecuentes"
          ? shortcuts?.frequent ?? []
          : tab === "mios"
            ? shortcuts?.mine ?? []
            : [];

  return (
    <div style={sheetStyle}>
      <SheetHeader title={`Agregar a ${MEAL_LABEL[mealKey].toLowerCase()}`} onClose={onClose} />
      <div style={{ padding: "12px 16px 0", background: "var(--pt-bg-card)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input autoFocus style={inputStyle} placeholder="Buscar alimento o receta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            type="button"
            onClick={() => setScanning(true)}
            aria-label="Escanear código de barras"
            style={{ flex: "none", width: 48, borderRadius: 12, border: "1px solid var(--pt-line)", background: "var(--pt-bg-card)", fontSize: 20, cursor: "pointer" }}
          >
            ▥
          </button>
        </div>
        {lookingUp && <p style={{ fontSize: 13, color: "var(--pt-ink-3)", margin: "8px 0 0" }}>Buscando el producto…</p>}
        {msg && !lookingUp && tab !== "plan" && <p style={{ fontSize: 13, color: "var(--pt-red)", margin: "8px 0 0" }}>{msg}</p>}
        {q.trim().length < 2 && (
          <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "10px 0" }}>
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    border: "1px solid var(--pt-line)",
                    background: tab === t.key ? "var(--pt-ink)" : "transparent",
                    color: tab === t.key ? "#fff" : "var(--pt-ink-2)",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", background: "var(--pt-bg-card)" }}>
        {q.trim().length < 2 && tab === "rapido" ? (
          <QuickAdd mealKey={mealKey} date={date} onDone={onClose} />
        ) : q.trim().length < 2 && tab === "plan" ? (
          <div>
            {myPlan.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const r = await addPlanOptionToDiary({ mealKey, optionId: o.id });
                      setMsg(r.added ? null : "Ya agregaste tu plan a esta comida.");
                      if (r.added) {
                        router.refresh();
                        onClose();
                      }
                    } catch (e) {
                      setMsg(e instanceof Error ? e.message : "No se pudo agregar.");
                    }
                  })
                }
                style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px", background: "none", border: "none", borderBottom: "1px solid var(--pt-line-soft)", cursor: "pointer" }}
              >
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {o.label} · {o.kcal} kcal
                </div>
                <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>{o.items.join(", ")}</div>
              </button>
            ))}
            {msg && <p style={{ padding: 16, fontSize: 13, color: "var(--pt-ink-2)" }}>{msg}</p>}
          </div>
        ) : (
          <>
            {list.map((h) => (
              <HitRow key={`${h.kind}${h.id}`} hit={h} onPick={() => setPicked(h)} />
            ))}
            {q.trim().length >= 2 && done && list.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: "var(--pt-ink-2)", display: "grid", gap: 10 }}>
                <span>No encontramos “{q}”. Prueba con otra palabra, escanea el código o créalo con los datos de la etiqueta.</span>
                <button
                  type="button"
                  onClick={() => setCreating({ prefill: { name: q.trim() }, fromOff: false })}
                  style={{ ...primaryBtn, background: "var(--pt-bg-card)", color: "var(--pt-ink)", border: "1px solid var(--pt-ink)" }}
                >
                  Crear “{q.trim()}”
                </button>
              </div>
            )}
            {q.trim().length >= 2 && loading && list.length === 0 && <p style={{ padding: 16, fontSize: 13, color: "var(--pt-ink-3)" }}>Buscando…</p>}
            {q.trim().length < 2 && shortcuts && list.length === 0 && (
              <p style={{ padding: 16, fontSize: 13, color: "var(--pt-ink-3)" }}>
                {tab === "mios" ? "Aquí aparecerán los alimentos y recetas que crees." : "Todavía no hay nada aquí. Busca arriba o escanea un producto."}
              </p>
            )}
            {q.trim().length < 2 && tab === "mios" && (
              <div style={{ padding: 16 }}>
                <button
                  type="button"
                  onClick={() => setCreating({ prefill: {}, fromOff: false })}
                  style={{ ...primaryBtn, background: "var(--pt-bg-card)", color: "var(--pt-ink)", border: "1px solid var(--pt-ink)" }}
                >
                  + Crear alimento desde la etiqueta
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
