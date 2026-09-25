"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  saveNutritionTarget,
  searchMembersForCalc,
  type MemberCalcContext,
} from "@/lib/actions/nutrition-targets";
import {
  ACTIVITY_LEVELS,
  BMR_METHOD_LABEL,
  GOALS,
  calculateTarget,
  type ActivityLevel,
  type CalcSex,
  type Goal,
} from "@/lib/nutrition/calc";
import { DEFAULT_MEAL_SPLIT, MEAL_KEYS, MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function MemberSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const r = await searchMembersForCalc(q);
      if (!cancelled) setResults(r);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <div className="relative">
      <Input placeholder="Cargar datos de un socio…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover shadow-md divide-y">
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => router.push(`/dashboard/nutricion/calculadora?socio=${m.id}`)}
              >
                {m.firstName} {m.lastName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CalorieCalculator({ context }: { context: MemberCalcContext | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sex, setSex] = useState<CalcSex | "">(context?.sex ?? "");
  const [age, setAge] = useState(context?.ageYears ? String(context.ageYears) : "");
  const [weight, setWeight] = useState(context?.weightKg ? String(context.weightKg) : "");
  const [height, setHeight] = useState(context?.heightCm ? String(context.heightCm) : "");
  const [bodyFat, setBodyFat] = useState(context?.bodyFatPct ? String(context.bodyFatPct) : "");
  const [bmr, setBmr] = useState(context?.measuredBmr ? String(context.measuredBmr) : "");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("lose");
  const [proteinPerKg, setProteinPerKg] = useState("");
  const [fatPct, setFatPct] = useState("27");
  const [split, setSplit] = useState<Record<MealKey, string>>(() => {
    const base = (context?.target?.mealSplit as Record<MealKey, number> | undefined) ?? DEFAULT_MEAL_SPLIT;
    return Object.fromEntries(MEAL_KEYS.map((k) => [k, String(base[k] ?? 0)])) as Record<MealKey, string>;
  });

  const ready = Number(weight) > 0 && Number(height) > 0 && Number(age) > 0;
  const result = useMemo(
    () =>
      ready
        ? calculateTarget({
            sex: sex || null,
            ageYears: Number(age),
            weightKg: Number(weight),
            heightCm: Number(height),
            bodyFatPct: bodyFat ? Number(bodyFat) : null,
            measuredBmr: bmr ? Number(bmr) : null,
            activity,
            goal,
            proteinPerKg: proteinPerKg ? Number(proteinPerKg) : undefined,
            fatPct: Number(fatPct) || 27,
          })
        : null,
    [ready, sex, age, weight, height, bodyFat, bmr, activity, goal, proteinPerKg, fatPct],
  );

  const splitTotal = MEAL_KEYS.reduce((a, k) => a + (Number(split[k]) || 0), 0);

  function saveTarget() {
    if (!context || !result) return;
    startTransition(async () => {
      try {
        await saveNutritionTarget(context.memberId, {
          kcal: result.kcal,
          proteinG: result.proteinG,
          carbsG: result.carbsG,
          fatG: result.fatG,
          mealSplit: Object.fromEntries(MEAL_KEYS.map((k) => [k, Number(split[k]) || 0])),
          inputs: { sex, age, weight, height, bodyFat, bmr, activity, goal, proteinPerKg: result.proteinPerKg, fatPct, method: result.bmrMethod },
        });
        toast.success(`Meta guardada para ${context.name}.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
          <CardDescription>
            {context ? (
              <>
                <Link href={`/dashboard/socios/${context.memberId}`} className="font-medium hover:underline">
                  {context.name}
                </Link>
                {context.measuredAt
                  ? ` · última medición ${new Date(context.measuredAt).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" })}`
                  : " · sin composición corporal registrada"}
              </>
            ) : (
              "Calcula para cualquier persona, o carga los datos de un socio."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MemberSearch />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Sexo</Label>
              <select className={selectCls} value={sex} onChange={(e) => setSex(e.target.value as CalcSex | "")}>
                <option value="">—</option>
                <option value="FEMALE">Mujer</option>
                <option value="MALE">Hombre</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>
            <Field label="Edad" value={age} onChange={setAge} unit="años" />
            <Field label="Peso" value={weight} onChange={setWeight} unit="kg" />
            <Field label="Estatura" value={height} onChange={setHeight} unit="cm" />
            <Field label="Grasa corporal" value={bodyFat} onChange={setBodyFat} unit="%" hint="opcional" />
            <Field label="Metabolismo basal medido" value={bmr} onChange={setBmr} unit="kcal" hint="bioimpedancia" />
          </div>
          <div className="space-y-1">
            <Label>Actividad</Label>
            <select className={selectCls} value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
              {(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY_LEVELS[k].label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Objetivo</Label>
            <select className={selectCls} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
              {(Object.keys(GOALS) as Goal[]).map((k) => (
                <option key={k} value={k}>
                  {GOALS[k].label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Proteína" value={proteinPerKg} onChange={setProteinPerKg} unit="g/kg" hint={result ? `auto ${result.proteinPerKg}` : "auto"} />
            <Field label="Grasa" value={fatPct} onChange={setFatPct} unit="% kcal" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meta diaria</CardTitle>
            {result && (
              <CardDescription>
                TMB {result.bmr} kcal ({BMR_METHOD_LABEL[result.bmrMethod]}) · gasto total {result.tdee} kcal
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!result ? (
              <p className="text-sm text-muted-foreground">Completa edad, peso y estatura.</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { l: "kcal", v: result.kcal },
                    { l: "Proteína", v: `${result.proteinG} g` },
                    { l: "Carbos", v: `${result.carbsG} g` },
                    { l: "Grasa", v: `${result.fatG} g` },
                  ].map((x) => (
                    <div key={x.l} className="rounded-md bg-muted/60 py-3">
                      <p className="text-xl font-semibold tabular-nums">{x.v}</p>
                      <p className="text-[10px] uppercase text-muted-foreground">{x.l}</p>
                    </div>
                  ))}
                </div>
                {result.warnings.map((w) => (
                  <p key={w} className="text-xs text-amber-700">
                    ⚠ {w}
                  </p>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reparto por comida</CardTitle>
            <CardDescription>
              Suma {splitTotal}%{splitTotal !== 100 ? " — se normaliza a 100% al guardar" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {MEAL_KEYS.map((k) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className="w-28">{MEAL_LABEL[k]}</span>
                <Input
                  className="h-8 w-20"
                  inputMode="numeric"
                  value={split[k]}
                  onChange={(e) => setSplit((s) => ({ ...s, [k]: e.target.value }))}
                />
                <span className="text-muted-foreground">%</span>
                {result && splitTotal > 0 && (
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    ≈ {Math.round((result.kcal * (Number(split[k]) || 0)) / splitTotal)} kcal
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {context && (
          <Card>
            <CardContent className="pt-4 space-y-2">
              {context.target && (
                <p className="text-sm text-muted-foreground">
                  Meta actual: <span className="font-medium text-foreground">{context.target.kcal} kcal</span> · P{" "}
                  {context.target.proteinG} · C {context.target.carbsG} · G {context.target.fatG}
                  {context.target.source === "MEMBER" ? " (la puso el socio)" : ""}
                </p>
              )}
              <Button className="w-full" disabled={!result || isPending} onClick={saveTarget}>
                {isPending ? "Guardando…" : `Guardar como meta de ${context.name.split(" ")[0]}`}
              </Button>
              <p className="text-xs text-muted-foreground">
                El socio la verá en su diario. Como la fija nutrición, él no la puede cambiar.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  unit,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label} <span className="text-muted-foreground">({unit}{hint ? ` · ${hint}` : ""})</span>
      </Label>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(",", "."))} />
    </div>
  );
}
