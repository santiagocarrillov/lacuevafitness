"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  archiveTemplate,
  duplicateTemplate,
  publishMemberPlan,
  saveMemberPlanAsTemplate,
  saveMemberPlanDraft,
  saveTemplate,
} from "@/lib/actions/meal-plans";
import {
  PLAN_KIND_LABEL,
  emptyPlanContent,
  enabledMeals,
  planAverageTotals,
  scalePlan,
  type PlanContent,
  type PlanTargets,
} from "@/lib/nutrition/plan-schema";
import { DEFAULT_MEAL_SPLIT, MEAL_KEYS, MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";
import { MenuEditor } from "./menu-editor";
import { ExchangesEditor } from "./exchanges-editor";
import { AssignDialog } from "./assign-dialog";

type Common = { content: PlanContent };

export type TemplateEditorProps = Common & {
  mode: "template";
  id: string;
  name: string;
  calorieLevel: number;
  notes: string | null;
};

export type MemberPlanEditorProps = Common & {
  mode: "member";
  id: string;
  title: string;
  publishedAt: string | null;
  publishedContent: PlanContent | null;
  member: { id: string; name: string };
  memberTarget: PlanTargets | null;
  template: { id: string; name: string } | null;
};

export type PlanEditorProps = TemplateEditorProps | MemberPlanEditorProps;

function isEmptyPlan(c: PlanContent) {
  return c.kind === "MENU"
    ? c.days.every((d) => d.meals.every((m) => m.options.every((o) => o.items.length === 0)))
    : c.exchanges.every((e) => Object.values(e.groups).every((n) => !n));
}

function Bar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(150, (value / target) * 100) : 0;
  const off = target > 0 && Math.abs(value - target) > target * 0.1;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className={`tabular-nums ${off ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>
          {Math.round(value)} / {Math.round(target)} {unit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${off ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function PlanEditor(props: PlanEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState<PlanContent>(props.content);
  const [title, setTitle] = useState(props.mode === "member" ? props.title : props.name);
  const [calorieLevel, setCalorieLevel] = useState(props.mode === "template" ? String(props.calorieLevel) : "");
  const [baseline, setBaseline] = useState(() => JSON.stringify({ c: props.content, t: title, k: calorieLevel }));
  const [assignOpen, setAssignOpen] = useState(false);
  const [scaleTo, setScaleTo] = useState("");

  const snapshot = JSON.stringify({ c: content, t: title, k: calorieLevel });
  const dirty = snapshot !== baseline;
  const unpublished =
    props.mode === "member" && (props.publishedContent === null || JSON.stringify(props.publishedContent) !== JSON.stringify(content));

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const totals = useMemo(() => planAverageTotals(content), [content]);
  const keys = enabledMeals(content);
  const mealTargets = useMemo(() => {
    const shares = keys.map((k) => DEFAULT_MEAL_SPLIT[k]);
    const sum = shares.reduce((a, b) => a + b, 0) || 1;
    return Object.fromEntries(keys.map((k, i) => [k, Math.round((content.targets.kcal * shares[i]) / sum)])) as Partial<Record<MealKey, number>>;
  }, [keys, content.targets.kcal]);

  function setTargets(patch: Partial<PlanTargets>) {
    setContent((c) => ({ ...c, targets: { ...c.targets, ...patch } }));
  }

  function toggleMeal(k: MealKey, on: boolean) {
    setContent((c) => {
      const meals = on
        ? MEAL_KEYS.filter((x) => x === k || c.meals.some((m) => m.key === x)).map(
            (x) => c.meals.find((m) => m.key === x) ?? { key: x, label: MEAL_LABEL[x], time: null },
          )
        : c.meals.filter((m) => m.key !== k);
      return meals.length ? { ...c, meals } : c;
    });
  }

  function setKind(kind: PlanContent["kind"]) {
    if (kind === content.kind) return;
    if (!isEmptyPlan(content) && !confirm("Cambiar de formato borra lo que armaste en este. ¿Continuar?")) return;
    setContent({ ...emptyPlanContent(kind, content.targets), meals: content.meals, notes: content.notes, recommendations: content.recommendations });
  }

  function run(fn: () => Promise<unknown>, ok: string, after?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        setBaseline(snapshot);
        toast.success(ok);
        after?.();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  function save() {
    if (props.mode === "member") run(() => saveMemberPlanDraft(props.id, { title, content }), "Borrador guardado. El socio aún no ve estos cambios.");
    else run(() => saveTemplate(props.id, { name: title, calorieLevel: Number(calorieLevel), notes: null, content }), "Plantilla guardada.");
  }

  function publish() {
    if (props.mode !== "member") return;
    if (isEmptyPlan(content) && !confirm("El plan está vacío. ¿Publicarlo igual?")) return;
    run(() => publishMemberPlan(props.id, { title, content }), `Publicado: ${props.member.name} ya lo ve en su app.`);
  }

  const kcalOff = content.targets.kcal > 0 && Math.abs(totals.kcal - content.targets.kcal) > content.targets.kcal * 0.1;
  const macroKcal = content.targets.proteinG * 4 + content.targets.carbsG * 4 + content.targets.fatG * 9;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-64 flex-1">
          <Input className="text-lg font-semibold h-10" value={title} onChange={(e) => setTitle(e.target.value)} />
          <p className="text-sm text-muted-foreground">
            {props.mode === "member" ? (
              <>
                Plan de{" "}
                <Link href={`/dashboard/socios/${props.member.id}`} className="font-medium text-foreground hover:underline">
                  {props.member.name}
                </Link>
                {props.template && <> · desde la plantilla “{props.template.name}”</>}
                {" · "}
                {props.publishedAt
                  ? `publicado el ${new Date(props.publishedAt).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}${unpublished ? " · hay cambios sin publicar" : ""}`
                  : "borrador: el socio todavía no lo ve"}
              </>
            ) : (
              "Plantilla reutilizable · se copia a cada socio al asignarla"
            )}
            {dirty && <span className="ml-2 text-amber-700">● sin guardar</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={isPending || !dirty} onClick={save}>
            {props.mode === "member" ? "Guardar borrador" : "Guardar"}
          </Button>
          {props.mode === "member" ? (
            <Button disabled={isPending || (!unpublished && !dirty)} onClick={publish}>
              {props.publishedAt ? "Publicar cambios" : "Publicar al socio"}
            </Button>
          ) : (
            <Button disabled={isPending} onClick={() => (dirty ? toast.error("Guarda la plantilla antes de asignarla.") : setAssignOpen(true))}>
              Asignar a socios
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4 min-w-0">
          {/* Setup */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-md border border-input overflow-hidden text-sm">
                  {(["MENU", "EXCHANGES"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`px-3 h-8 ${content.kind === k ? "bg-foreground text-background" : ""}`}
                    >
                      {PLAN_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
                {props.mode === "template" && (
                  <div className="flex items-center gap-2 text-sm">
                    <Label htmlFor="t-kcal">Nivel</Label>
                    <Input id="t-kcal" className="h-8 w-24" inputMode="numeric" value={calorieLevel} onChange={(e) => setCalorieLevel(e.target.value)} />
                    <span className="text-muted-foreground">kcal</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    ["kcal", "Meta kcal"],
                    ["proteinG", "Proteína g"],
                    ["carbsG", "Carbos g"],
                    ["fatG", "Grasa g"],
                  ] as const
                ).map(([k, l]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{l}</Label>
                    <Input
                      inputMode="numeric"
                      value={String(content.targets[k] || "")}
                      onChange={(e) => setTargets({ [k]: Number(e.target.value) || 0 })}
                    />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Los macros suman {Math.round(macroKcal)} kcal</span>
                {props.mode === "member" && props.memberTarget && (
                  <button type="button" className="underline" onClick={() => setTargets(props.memberTarget!)}>
                    Usar la meta del socio ({props.memberTarget.kcal} kcal)
                  </button>
                )}
                {props.mode === "member" && (
                  <Link href={`/dashboard/nutricion/calculadora?socio=${props.member.id}`} className="underline">
                    Calculadora
                  </Link>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                {MEAL_KEYS.map((k) => {
                  const slot = content.meals.find((m) => m.key === k);
                  return (
                    <div key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={Boolean(slot)} onChange={(e) => toggleMeal(k, e.target.checked)} aria-label={MEAL_LABEL[k]} />
                      <span>{MEAL_LABEL[k]}</span>
                      {slot && (
                        <input
                          type="time"
                          value={slot.time ?? ""}
                          onChange={(e) =>
                            setContent((c) => ({ ...c, meals: c.meals.map((m) => (m.key === k ? { ...m, time: e.target.value || null } : m)) }))
                          }
                          className="h-7 rounded border border-input bg-background px-1 text-xs"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {content.kind === "MENU" ? (
            <MenuEditor content={content} onChange={setContent} mealTargets={mealTargets} />
          ) : (
            <ExchangesEditor content={content} onChange={setContent} mealTargets={mealTargets} />
          )}

          <Card>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="p-notes">Indicaciones generales</Label>
                <textarea
                  id="p-notes"
                  rows={4}
                  value={content.notes ?? ""}
                  onChange={(e) => setContent((c) => ({ ...c, notes: e.target.value || null }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Hidratación, horarios, cómo usar las opciones…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p-recs">Recomendaciones (una por línea)</Label>
                <textarea
                  id="p-recs"
                  rows={4}
                  value={content.recommendations.join("\n")}
                  onChange={(e) => setContent((c) => ({ ...c, recommendations: e.target.value.split("\n") }))}
                  onBlur={() => setContent((c) => ({ ...c, recommendations: c.recommendations.map((r) => r.trim()).filter(Boolean) }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder={"2 L de agua al día\nEvitar gaseosas"}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 xl:sticky xl:top-4 self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Total del día
                {content.kind === "MENU" && content.days.length > 1 && (
                  <span className="block text-xs font-normal text-muted-foreground">promedio de la semana</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className={`text-3xl font-semibold tabular-nums ${kcalOff ? "text-amber-700" : ""}`}>
                {totals.kcal} <span className="text-base font-normal text-muted-foreground">kcal</span>
              </p>
              <Bar label="Calorías" value={totals.kcal} target={content.targets.kcal} unit="kcal" />
              <Bar label="Proteína" value={totals.proteinG} target={content.targets.proteinG} unit="g" />
              <Bar label="Carbohidratos" value={totals.carbsG} target={content.targets.carbsG} unit="g" />
              <Bar label="Grasa" value={totals.fatG} target={content.targets.fatG} unit="g" />
              {content.kind === "MENU" && (
                <p className="text-[11px] text-muted-foreground">Con varias opciones en una comida se cuenta el promedio.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Herramientas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label className="text-xs">Reescalar todo el plan a</Label>
                <div className="flex gap-2">
                  <Input className="h-8" inputMode="numeric" placeholder="kcal" value={scaleTo} onChange={(e) => setScaleTo(e.target.value)} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!(Number(scaleTo) >= 800)}
                    onClick={() => {
                      setContent((c) => scalePlan(c, Number(scaleTo)));
                      toast.success(`Reescalado a ${scaleTo} kcal: gramos e intercambios ajustados. Revisa y guarda.`);
                      setScaleTo("");
                    }}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>
              {props.mode === "member" ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    disabled={isPending}
                    onClick={() => {
                      const name = prompt("Nombre de la plantilla", `${Math.round(content.targets.kcal)} kcal · ${PLAN_KIND_LABEL[content.kind]}`);
                      if (name) run(() => saveMemberPlanAsTemplate(props.id, name), "Guardado como plantilla.");
                    }}
                  >
                    Guardar como plantilla
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => (dirty ? toast.error("Guarda el plan antes de compartirlo.") : setAssignOpen(true))}
                  >
                    Compartir con otros socios
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const { id } = await duplicateTemplate(props.id);
                        router.push(`/dashboard/nutricion/planes/plantilla/${id}`);
                      })
                    }
                  >
                    Duplicar plantilla
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start text-red-700"
                    disabled={isPending}
                    onClick={() => {
                      if (!confirm("¿Archivar esta plantilla? Los planes ya asignados no cambian.")) return;
                      startTransition(async () => {
                        await archiveTemplate(props.id);
                        router.push("/dashboard/nutricion/planes");
                      });
                    }}
                  >
                    Archivar plantilla
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {assignOpen && (
        <AssignDialog
          open
          onOpenChange={setAssignOpen}
          source={props.mode === "template" ? { templateId: props.id } : { planId: props.id }}
          sourceKcal={Math.round(content.targets.kcal)}
          exclude={props.mode === "member" ? [props.member.id] : []}
        />
      )}
    </div>
  );
}
