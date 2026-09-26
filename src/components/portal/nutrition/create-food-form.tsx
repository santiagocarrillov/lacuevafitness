"use client";

import { useState, useTransition } from "react";
import { createMyFood } from "@/lib/actions/barcode";
import type { DiaryFood } from "@/lib/actions/food-log";
import type { FoodInput } from "@/lib/nutrition/food-input";
import { inputStyle, primaryBtn } from "./add-food-sheet";

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/**
 * Socio creates a food from a nutrition label (or confirms an Open Food Facts
 * prefill). Values can be typed per 100 g or per portion, as printed.
 */
export function CreateFoodForm({
  prefill,
  fromOpenFoodFacts,
  onCreated,
}: {
  prefill: Partial<FoodInput>;
  fromOpenFoodFacts: boolean;
  onCreated: (food: DiaryFood) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(prefill.name ?? "");
  const [brand, setBrand] = useState(prefill.brand ?? "");
  const [isLiquid, setIsLiquid] = useState(prefill.isLiquid ?? false);
  const [basis, setBasis] = useState<"100" | "portion">("100");
  const [portionGrams, setPortionGrams] = useState(str(prefill.portions?.[0]?.grams));
  const [v, setV] = useState({
    kcal: str(prefill.kcal),
    proteinG: str(prefill.proteinG),
    carbsG: str(prefill.carbsG),
    fatG: str(prefill.fatG),
    fiberG: str(prefill.fiberG),
    sugarG: str(prefill.sugarG),
    sodiumMg: str(prefill.sodiumMg),
  });
  const unit = isLiquid ? "ml" : "g";
  const factor = basis === "100" ? 1 : 100 / (Number(portionGrams) || NaN);

  function save() {
    const per100 = (s: string) => (s === "" ? null : Math.round(Number(s) * factor * 10) / 10);
    if (basis === "portion" && !(Number(portionGrams) > 0)) {
      setError(`¿De cuántos ${unit} es la porción de la etiqueta?`);
      return;
    }
    const portions = Number(portionGrams) > 0 ? [{ label: "1 porción", grams: Number(portionGrams) }] : [];
    startTransition(async () => {
      try {
        const food = await createMyFood({
          name,
          brand: brand || null,
          barcode: prefill.barcode ?? null,
          isLiquid,
          kcal: per100(v.kcal) ?? NaN,
          proteinG: per100(v.proteinG) ?? NaN,
          carbsG: per100(v.carbsG) ?? NaN,
          fatG: per100(v.fatG) ?? NaN,
          fiberG: per100(v.fiberG),
          sugarG: per100(v.sugarG),
          sodiumMg: per100(v.sodiumMg),
          portions,
          fromOpenFoodFacts,
        });
        onCreated(food);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  const label = { display: "grid", gap: 4, fontSize: 12, color: "var(--pt-ink-2)" } as const;
  const small = { ...inputStyle, padding: "9px 10px" };

  return (
    <div style={{ padding: 16, display: "grid", gap: 10, overflowY: "auto", background: "var(--pt-bg-card)", flex: 1 }}>
      {fromOpenFoodFacts ? (
        <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: 0 }}>
          Encontramos este producto en una base abierta. Revisa que coincida con la etiqueta y guárdalo.
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: 0 }}>
          {prefill.barcode ? "Aún no tenemos este producto. " : ""}Copia los datos de la tabla nutricional de la etiqueta.
        </p>
      )}
      {prefill.barcode && <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>Código {prefill.barcode}</div>}
      <label style={label}>
        Nombre
        <input style={small} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Yogur griego natural" />
      </label>
      <label style={label}>
        Marca
        <input style={small} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Opcional" />
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={isLiquid} onChange={(e) => setIsLiquid(e.target.checked)} /> Es bebida (ml)
      </label>

      <div style={{ display: "flex", gap: 6 }}>
        {(["100", "portion"] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBasis(b)}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              fontSize: 13,
              border: "1px solid var(--pt-line)",
              background: basis === b ? "var(--pt-ink)" : "transparent",
              color: basis === b ? "#fff" : "var(--pt-ink-2)",
              cursor: "pointer",
            }}
          >
            {b === "100" ? `Por 100 ${unit}` : "Por porción"}
          </button>
        ))}
      </div>
      <label style={label}>
        Tamaño de la porción ({unit}) {basis === "100" ? "· opcional" : ""}
        <input style={small} inputMode="decimal" value={portionGrams} onChange={(e) => setPortionGrams(e.target.value.replace(",", "."))} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(
          [
            ["kcal", "Calorías *"],
            ["proteinG", "Proteína g *"],
            ["carbsG", "Carbohidratos g *"],
            ["fatG", "Grasa g *"],
            ["fiberG", "Fibra g"],
            ["sugarG", "Azúcares g"],
            ["sodiumMg", "Sodio mg"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} style={label}>
            {l}
            <input style={small} inputMode="decimal" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value.replace(",", ".") }))} />
          </label>
        ))}
      </div>
      {error && <p style={{ color: "var(--pt-red)", fontSize: 13, margin: 0 }}>{error}</p>}
      <button type="button" disabled={pending} onClick={save} style={{ ...primaryBtn, opacity: pending ? 0.6 : 1 }}>
        {pending ? "Guardando…" : "Guardar y agregar"}
      </button>
      <p style={{ fontSize: 11, color: "var(--pt-ink-3)", margin: 0 }}>
        Lo puedes usar desde ya. Tu nutricionista lo revisa antes de que lo vean los demás socios.
      </p>
    </div>
  );
}
