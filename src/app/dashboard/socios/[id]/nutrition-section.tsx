"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createMealPlan, setMealPlanActive } from "@/lib/actions/nutrition";

type MealPlan = {
  id: string;
  title: string;
  calorieTarget: number | null;
  externalUrl: string | null;
  active: boolean;
  visibleToMember: boolean;
  createdAt: Date;
};

type MealLog = {
  id: string;
  date: Date;
  followed: boolean;
  freeText: string | null;
};

function fmtDay(d: Date) {
  return new Date(d).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}

export function NutritionSection({
  memberId,
  plans,
  logs,
}: {
  memberId: string;
  plans: MealPlan[];
  logs: MealLog[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    title: "",
    calorieTarget: "",
    externalUrl: "",
    visibleToMember: true,
  });

  function update(field: string, value: string | boolean) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("El plan necesita un título.");
      return;
    }
    startTransition(async () => {
      try {
        await createMealPlan(memberId, {
          title: form.title.trim(),
          calorieTarget: form.calorieTarget ? Number(form.calorieTarget) : null,
          externalUrl: form.externalUrl || null,
          visibleToMember: form.visibleToMember,
        });
        toast.success("Plan creado.");
        setForm({ title: "", calorieTarget: "", externalUrl: "", visibleToMember: true });
        router.refresh();
      } catch {
        toast.error("No se pudo crear el plan.");
      }
    });
  }

  function handleArchive(id: string, active: boolean) {
    startTransition(async () => {
      try {
        await setMealPlanActive(id, memberId, !active);
        toast.success(active ? "Plan archivado." : "Plan reactivado.");
        router.refresh();
      } catch {
        toast.error("No se pudo actualizar.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nutrición</CardTitle>
        <CardDescription>
          Plan alimenticio del socio y su adherencia diaria. El socio ve los planes marcados como visibles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Crear plan */}
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Título *</Label>
              <Input
                placeholder="Plan 1400 kcal — marzo"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Calorías/día</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="1400"
                value={form.calorieTarget}
                onChange={(e) => update("calorieTarget", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Enlace al plan (Google Doc / Sheet)</Label>
            <Input
              type="url"
              placeholder="https://docs.google.com/…"
              value={form.externalUrl}
              onChange={(e) => update("externalUrl", e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.visibleToMember}
                onChange={(e) => update("visibleToMember", e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Visible para el socio (aparece en su app)
            </label>
            <Button type="submit" size="sm" disabled={isPending || !form.title.trim()}>
              Crear plan
            </Button>
          </div>
        </form>

        {/* Lista de planes */}
        <div className="space-y-2">
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin planes registrados.</p>
          ) : (
            plans.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{p.title}</span>
                    {p.calorieTarget && (
                      <span className="text-muted-foreground">{p.calorieTarget} kcal</span>
                    )}
                    {!p.active && <Badge variant="outline" className="text-[10px]">Archivado</Badge>}
                    {p.active && p.visibleToMember && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-600/40">
                        Visible
                      </Badge>
                    )}
                    {p.active && !p.visibleToMember && (
                      <Badge variant="outline" className="text-[10px]">Oculto</Badge>
                    )}
                  </div>
                  {p.externalUrl && (
                    <a
                      href={p.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline underline-offset-2 truncate inline-block max-w-full"
                    >
                      Abrir plan ↗
                    </a>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleArchive(p.id, p.active)}
                  className="shrink-0"
                >
                  {p.active ? "Archivar" : "Reactivar"}
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Adherencia */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Adherencia reciente</h4>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">El socio aún no registra comidas.</p>
          ) : (
            <div className="space-y-1.5">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start gap-3 text-sm">
                  <span className="text-muted-foreground w-14 shrink-0">{fmtDay(l.date)}</span>
                  <span className={l.followed ? "text-emerald-600" : "text-muted-foreground"}>
                    {l.followed ? "✓ Cumplió" : "✗ No marcó"}
                  </span>
                  {l.freeText && <span className="text-muted-foreground flex-1">· {l.freeText}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
