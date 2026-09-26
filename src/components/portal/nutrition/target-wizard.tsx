"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMyNutritionTarget } from "@/lib/actions/food-log";
import { ACTIVITY_LEVELS, GOALS, calculateTarget, type ActivityLevel, type CalcSex, type Goal } from "@/lib/nutrition/calc";
import { SheetHeader, inputStyle, primaryBtn, sheetStyle } from "./add-food-sheet";

export type WizardPrefill = {
  sex: CalcSex | null;
  ageYears: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  measuredBmr: number | null;
};

/** "Calcula tu meta": the socio's own daily target when the nutritionist hasn't set one. */
export function TargetWizard({ prefill, onClose }: { prefill: WizardPrefill; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sex, setSex] = useState<CalcSex | "">(prefill.sex ?? "");
  const [age, setAge] = useState(prefill.ageYears ? String(prefill.ageYears) : "");
  const [weight, setWeight] = useState(prefill.weightKg ? String(prefill.weightKg) : "");
  const [height, setHeight] = useState(prefill.heightCm ? String(prefill.heightCm) : "");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("lose");

  const ready = Number(age) > 12 && Number(weight) > 30 && Number(height) > 120;
  const result = useMemo(
    () =>
      ready
        ? calculateTarget({
            sex: sex || null,
            ageYears: Number(age),
            weightKg: Number(weight),
            heightCm: Number(height),
            bodyFatPct: prefill.bodyFatPct,
            measuredBmr: prefill.measuredBmr,
            activity,
            goal,
          })
        : null,
    [ready, sex, age, weight, height, activity, goal, prefill.bodyFatPct, prefill.measuredBmr],
  );

  const label = { display: "grid", gap: 6, fontSize: 13, color: "var(--pt-ink-2)" } as const;

  return (
    <div style={sheetStyle}>
      <SheetHeader title="Calcula tu meta" onClose={onClose} />
      <div style={{ padding: 16, display: "grid", gap: 12, overflowY: "auto", background: "var(--pt-bg-card)", flex: 1 }}>
        <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: 0 }}>
          Una meta de partida para tu diario. Cuando tu nutricionista te asigne la tuya, reemplaza esta.
        </p>
        <label style={label}>
          Sexo
          <select style={inputStyle} value={sex} onChange={(e) => setSex(e.target.value as CalcSex | "")}>
            <option value="">—</option>
            <option value="FEMALE">Mujer</option>
            <option value="MALE">Hombre</option>
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <label style={label}>
            Edad
            <input style={inputStyle} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
          </label>
          <label style={label}>
            Peso kg
            <input style={inputStyle} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(",", "."))} />
          </label>
          <label style={label}>
            Estatura cm
            <input style={inputStyle} inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} />
          </label>
        </div>
        <label style={label}>
          ¿Cuánto te mueves?
          <select style={inputStyle} value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
            {(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_LEVELS[k].label}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          Tu objetivo
          <select style={inputStyle} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            {(Object.keys(GOALS) as Goal[]).map((k) => (
              <option key={k} value={k}>
                {GOALS[k].label}
              </option>
            ))}
          </select>
        </label>
        {result && (
          <div className="portal-card-alt" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{result.kcal} kcal</div>
            <div style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
              Proteína {result.proteinG} g · Carbos {result.carbsG} g · Grasa {result.fatG} g
            </div>
          </div>
        )}
        {error && <p style={{ color: "var(--pt-red)", fontSize: 13, margin: 0 }}>{error}</p>}
        <button
          type="button"
          disabled={!result || pending}
          style={{ ...primaryBtn, opacity: !result || pending ? 0.5 : 1 }}
          onClick={() =>
            startTransition(async () => {
              try {
                await saveMyNutritionTarget({
                  kcal: result!.kcal,
                  proteinG: result!.proteinG,
                  carbsG: result!.carbsG,
                  fatG: result!.fatG,
                  inputs: { sex, age, weight, height, activity, goal, method: result!.bmrMethod },
                });
                router.refresh();
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo guardar.");
              }
            })
          }
        >
          Usar esta meta
        </button>
      </div>
    </div>
  );
}
