"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEST_LABELS } from "@/lib/portal/test-labels";

export type ChallengeForm = {
  name: string;
  description: string;
  reward: string;
  ruleType: string;
  ruleTarget: string;
  ruleDays: string;
  metricTest: string;
  sede: string;
  startsAt: string;
  endsAt: string;
};

export const RULE_OPTIONS = [
  { value: "TOTAL_CLASSES", label: "Asistencia · X clases totales" },
  { value: "CONSECUTIVE_CLASSES", label: "Asistencia · X clases consecutivas" },
  { value: "CLASSES_IN_DAYS", label: "Asistencia · X clases en Y días" },
  { value: "WEIGHT_LOSS", label: "SRXFIT · Mayor pérdida de peso" },
  { value: "WAIST_LOSS", label: "SRXFIT · Mayor reducción de cintura" },
  { value: "TEST_IMPROVEMENT", label: "SRXFIT · Mayor mejora en marcas" },
];

export const METRIC_RULES = ["WEIGHT_LOSS", "WAIST_LOSS", "TEST_IMPROVEMENT"];
export const isMetric = (t: string) => METRIC_RULES.includes(t);

// Threshold label + unit hint per rule type.
function targetLabel(ruleType: string): { label: string; required: boolean } {
  switch (ruleType) {
    case "WEIGHT_LOSS":
      return { label: "Meta mínima (lb perdidas) — opcional", required: false };
    case "WAIST_LOSS":
      return { label: "Meta mínima (% reducción) — opcional", required: false };
    case "TEST_IMPROVEMENT":
      return { label: "Meta mínima (% mejora) — opcional", required: false };
    default:
      return { label: "Meta (# clases) *", required: true };
  }
}

export function ChallengeFields({
  form,
  update,
}: {
  form: ChallengeForm;
  update: (field: keyof ChallengeForm, value: string) => void;
}) {
  const metric = isMetric(form.ruleType);
  const tgt = targetLabel(form.ruleType);

  return (
    <>
      <div className="space-y-1">
        <Label>Nombre del reto *</Label>
        <Input required placeholder='ej: "Reto 30 clases"' value={form.name} onChange={(e) => update("name", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Descripción</Label>
        <Input placeholder='ej: "Asiste a 30 clases en 60 días"' value={form.description} onChange={(e) => update("description", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Recompensa</Label>
        <Input placeholder='ej: "Camiseta La Cueva"' value={form.reward} onChange={(e) => update("reward", e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label>Tipo de reto *</Label>
        <select value={form.ruleType} onChange={(e) => update("ruleType", e.target.value)}
          className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
          {RULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {metric && (
          <p className="text-xs text-muted-foreground pt-0.5">
            Ranking en vivo: compara la medida de partida (antes del inicio) con la más reciente del período.
          </p>
        )}
      </div>

      {form.ruleType === "TEST_IMPROVEMENT" && (
        <div className="space-y-1">
          <Label>Ejercicio</Label>
          <select value={form.metricTest} onChange={(e) => update("metricTest", e.target.value)}
            className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
            <option value="">Todos (promedio de % de mejora)</option>
            {(Object.keys(TEST_LABELS) as Array<keyof typeof TEST_LABELS>).map((k) => (
              <option key={k} value={k}>{TEST_LABELS[k].label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>{tgt.label}</Label>
          <Input type="number" required={tgt.required} min={metric ? 0 : 1}
            step={form.ruleType === "WEIGHT_LOSS" || metric === false ? 1 : "any"}
            placeholder={metric ? "opcional" : ""}
            value={form.ruleTarget} onChange={(e) => update("ruleTarget", e.target.value)} />
        </div>
        {form.ruleType === "CLASSES_IN_DAYS" && (
          <div className="space-y-1">
            <Label>En cuántos días</Label>
            <Input type="number" min={1} value={form.ruleDays} onChange={(e) => update("ruleDays", e.target.value)} />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label>Sede</Label>
        <select value={form.sede} onChange={(e) => update("sede", e.target.value)}
          className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
          <option value="">Ambas sedes</option>
          <option value="FITNESS_CENTER">Fitness Center</option>
          <option value="XTREME">Xtreme</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Fecha inicio *</Label>
          <Input type="date" required value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Fecha fin *</Label>
          <Input type="date" required value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} />
        </div>
      </div>
    </>
  );
}
