"use client";

import { useState, useTransition } from "react";
import { upsertTestResult, upsertBodyComposition, completeEvaluation } from "@/lib/actions/srxfit";
import { TestKey } from "@/generated/prisma/client";

// ─── Test metadata ────────────────────────────────────────────────────

type TestMeta = {
  key: TestKey;
  label: string;
  unit: string;
  hint: string;
  isTime?: boolean; // input as mm:ss
  formula?: (v: number) => string; // derived display (e.g. 1RM)
};

const TEST_GROUPS: Array<{ title: string; day: string; tests: TestMeta[] }> = [
  {
    title: "Fuerza absoluta inferior",
    day: "Lunes (Día 1)",
    tests: [
      {
        key: "BACK_SQUAT_3RM",
        label: "Back squat — 3RM técnico",
        unit: "kg",
        hint: "Peso del 3RM técnico",
        formula: (v) => `1RM estimado ≈ ${(v * 1.08).toFixed(1)} kg`,
      },
      {
        key: "DEADLIFT_3RM",
        label: "Deadlift — 3RM técnico",
        unit: "kg",
        hint: "Peso del 3RM técnico",
        formula: (v) => `1RM estimado ≈ ${(v * 1.08).toFixed(1)} kg`,
      },
    ],
  },
  {
    title: "Fuerza relativa + empuje",
    day: "Martes (Día 2)",
    tests: [
      {
        key: "PLANK_SECONDS",
        label: "Plank — tiempo máximo",
        unit: "seg",
        hint: "Segundos hasta pérdida de forma",
      },
      {
        key: "DEAD_HANG_SECONDS",
        label: "Dead hang en barra",
        unit: "seg",
        hint: "Segundos hasta pérdida de agarre",
      },
      {
        key: "PULL_UPS_MAX",
        label: "Pull-ups strict — máximo",
        unit: "reps",
        hint: "Reps en rango completo",
      },
      {
        key: "RING_ROW_ANGLE",
        label: "Ring row — ángulo (scaling N1)",
        unit: "grados",
        hint: "Ángulo del cuerpo si no hay pull-ups",
      },
      {
        key: "BENCH_PRESS_3RM",
        label: "Bench press — 3RM técnico (Fitness)",
        unit: "kg",
        hint: "La Cueva Fitness Center",
        formula: (v) => `1RM estimado ≈ ${(v * 1.08).toFixed(1)} kg`,
      },
      {
        key: "PUSH_PRESS_3RM",
        label: "Push press — 3RM técnico (Xtreme)",
        unit: "kg",
        hint: "La Cueva Xtreme",
        formula: (v) => `1RM estimado ≈ ${(v * 1.08).toFixed(1)} kg`,
      },
    ],
  },
  {
    title: "Acondicionamiento anaeróbico",
    day: "Miércoles (Día 3)",
    tests: [
      {
        key: "CHRISTINE_TIME_SECONDS",
        label: "Christine — 3 RFT",
        unit: "seg",
        hint: "500m remo + 12 DL (PC) + 21 box jumps 20\" × 3",
        isTime: true,
      },
    ],
  },
  {
    title: "Capacidad aeróbica",
    day: "Jueves (Día 4)",
    tests: [
      {
        key: "COOPER_METERS",
        label: "Cooper 12 min",
        unit: "metros",
        hint: "Metros recorridos en 12 min",
        formula: (v) => `VO₂max estimado ≈ ${((v - 504.9) / 44.73).toFixed(1)} ml/kg/min`,
      },
    ],
  },
  {
    title: "Módulo CrossFit (solo Fitness Center)",
    day: "Viernes (Día 5) — opcional",
    tests: [
      {
        key: "CLEAN_JERK_1RM",
        label: "Clean & Jerk — 1RM",
        unit: "kg",
        hint: "Solo miembros con base técnica confirmada",
      },
      {
        key: "SNATCH_1RM",
        label: "Snatch — 1RM",
        unit: "kg",
        hint: "Solo miembros con base técnica confirmada",
      },
      {
        key: "ROW_500M_SPRINT_SECONDS",
        label: "500m remo sprint",
        unit: "seg",
        hint: "Tiempo desde parado",
        isTime: true,
      },
    ],
  },
];

// ─── Time input (mm:ss → seconds) ────────────────────────────────────

function timeToSeconds(val: string): number {
  if (!val.includes(":")) return parseFloat(val) || 0;
  const [mm, ss] = val.split(":").map(Number);
  return (mm || 0) * 60 + (ss || 0);
}

function secondsToTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ─── Single test row ──────────────────────────────────────────────────

function TestRow({
  meta,
  evaluationId,
  memberId,
  currentValue,
}: {
  meta: TestMeta;
  evaluationId: string;
  memberId: string;
  currentValue?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(
    currentValue !== undefined
      ? meta.isTime
        ? secondsToTime(currentValue)
        : String(currentValue)
      : "",
  );
  const [saved, setSaved] = useState(currentValue !== undefined);
  const [notes, setNotes] = useState("");

  const numericValue = meta.isTime ? timeToSeconds(value) : parseFloat(value);
  const derivedLabel = meta.formula && numericValue > 0 ? meta.formula(numericValue) : null;

  function handleSave() {
    if (!value || numericValue <= 0) return;
    startTransition(async () => {
      await upsertTestResult({
        evaluationId,
        memberId,
        test: meta.key,
        valueNumeric: numericValue,
        unit: meta.unit,
        notes: notes || undefined,
      });
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-1 py-3 border-b last:border-0">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-0.5 flex-1 min-w-0">
          <p className="text-sm font-medium">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.hint}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <input
              type={meta.isTime ? "text" : "number"}
              placeholder={meta.isTime ? "mm:ss" : meta.unit}
              value={value}
              onChange={(e) => { setValue(e.target.value); setSaved(false); }}
              className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm"
              step={meta.isTime ? undefined : "0.1"}
              min="0"
            />
            <span className="text-xs text-muted-foreground w-8">{meta.unit}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={isPending || !value}
            className={`h-8 px-3 text-xs rounded-md transition ${
              saved
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-primary text-primary-foreground hover:opacity-90"
            } disabled:opacity-40`}
          >
            {isPending ? "..." : saved ? "✓ Guardado" : "Guardar"}
          </button>
        </div>
      </div>
      {derivedLabel && numericValue > 0 && (
        <p className="text-xs text-blue-700 font-medium">{derivedLabel}</p>
      )}
    </div>
  );
}

// ─── Test form ────────────────────────────────────────────────────────

export function TestForm({
  evaluationId,
  memberId,
  currentResults,
}: {
  evaluationId: string;
  memberId: string;
  currentResults: Array<{ test: TestKey; valueNumeric: number }>;
}) {
  const resultMap = new Map(currentResults.map((r) => [r.test, r.valueNumeric]));

  return (
    <div className="space-y-6">
      {TEST_GROUPS.map((group) => (
        <div key={group.title} className="rounded-lg border overflow-hidden">
          <div className="px-4 py-3 bg-muted/50 border-b">
            <p className="text-sm font-semibold">{group.title}</p>
            <p className="text-xs text-muted-foreground">{group.day}</p>
          </div>
          <div className="px-4">
            {group.tests.map((test) => (
              <TestRow
                key={test.key}
                meta={test}
                evaluationId={evaluationId}
                memberId={memberId}
                currentValue={resultMap.get(test.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Body composition form ─────────────────────────────────────────────

type BodyCompData = {
  weightKg?: number | null;
  heightCm?: number | null;
  bodyFatPct?: number | null;
  muscleMassKg?: number | null;
  waterPct?: number | null;
  basalMetabolism?: number | null;
  notes?: string | null;
};

export function BodyCompForm({
  evaluationId,
  memberId,
  current,
}: {
  evaluationId: string;
  memberId: string;
  current?: BodyCompData;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(!!current?.weightKg);

  const [fields, setFields] = useState({
    weightKg: current?.weightKg ? String(current.weightKg) : "",
    heightCm: current?.heightCm ? String(current.heightCm) : "",
    bodyFatPct: current?.bodyFatPct ? String(current.bodyFatPct) : "",
    muscleMassKg: current?.muscleMassKg ? String(current.muscleMassKg) : "",
    waterPct: current?.waterPct ? String(current.waterPct) : "",
    basalMetabolism: current?.basalMetabolism ? String(current.basalMetabolism) : "",
    notes: current?.notes ?? "",
  });

  function set(key: keyof typeof fields, val: string) {
    setFields((f) => ({ ...f, [key]: val }));
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      await upsertBodyComposition({
        evaluationId,
        memberId,
        weightKg: fields.weightKg ? parseFloat(fields.weightKg) : undefined,
        heightCm: fields.heightCm ? parseFloat(fields.heightCm) : undefined,
        bodyFatPct: fields.bodyFatPct ? parseFloat(fields.bodyFatPct) : undefined,
        muscleMassKg: fields.muscleMassKg ? parseFloat(fields.muscleMassKg) : undefined,
        waterPct: fields.waterPct ? parseFloat(fields.waterPct) : undefined,
        basalMetabolism: fields.basalMetabolism ? parseInt(fields.basalMetabolism) : undefined,
        notes: fields.notes || undefined,
      });
      setSaved(true);
    });
  }

  // Derived: fat kg
  const fatKg =
    fields.weightKg && fields.bodyFatPct
      ? ((parseFloat(fields.weightKg) * parseFloat(fields.bodyFatPct)) / 100).toFixed(1)
      : null;

  const InputField = ({
    label, field, unit, step = "0.1",
  }: {
    label: string;
    field: keyof typeof fields;
    unit: string;
    step?: string;
  }) => (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step={step}
          min="0"
          value={fields[field]}
          onChange={(e) => set(field, e.target.value)}
          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-4 py-3 bg-muted/50 border-b">
        <p className="text-sm font-semibold">Composición corporal</p>
        <p className="text-xs text-muted-foreground">Báscula de impedancia o medición InBody</p>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <InputField label="Peso" field="weightKg" unit="kg" />
          <InputField label="Talla" field="heightCm" unit="cm" step="1" />
          <InputField label="% Grasa corporal" field="bodyFatPct" unit="%" />
          <InputField label="Masa muscular" field="muscleMassKg" unit="kg" />
          <InputField label="% Agua" field="waterPct" unit="%" />
          <InputField label="Metabolismo basal" field="basalMetabolism" unit="kcal" step="1" />
        </div>

        {fatKg && (
          <p className="text-sm text-blue-700 font-medium">
            Masa grasa estimada: {fatKg} kg
          </p>
        )}

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Notas</label>
          <textarea
            value={fields.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            placeholder="Observaciones del coach..."
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Los datos se comparan con la evaluación anterior para calcular la pérdida de grasa global.
          </p>
          <button
            onClick={handleSave}
            disabled={isPending}
            className={`h-8 px-4 text-sm rounded-md transition ${
              saved
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-primary text-primary-foreground hover:opacity-90"
            } disabled:opacity-40`}
          >
            {isPending ? "Guardando..." : saved ? "✓ Guardado" : "Guardar composición"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Complete evaluation button ───────────────────────────────────────

export function CompleteEvalButton({
  evaluationId,
  memberId,
  isCompleted,
}: {
  evaluationId: string;
  memberId: string;
  isCompleted: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(isCompleted);
  const [summary, setSummary] = useState("");

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2">
        <span className="text-green-800 text-sm font-medium">✓ Evaluación completada</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <p className="text-sm font-medium">Completar evaluación</p>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
        placeholder="Resumen / observaciones finales (opcional)..."
      />
      <button
        onClick={() => {
          startTransition(async () => {
            await completeEvaluation(evaluationId, memberId, summary || undefined);
            setDone(true);
          });
        }}
        disabled={isPending}
        className="h-9 px-4 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-40"
      >
        {isPending ? "Completando..." : "Marcar como completada"}
      </button>
    </div>
  );
}
