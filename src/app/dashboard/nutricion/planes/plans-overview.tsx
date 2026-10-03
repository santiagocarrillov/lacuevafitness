"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PLAN_KIND_LABEL, type PlanKind } from "@/lib/nutrition/plan-schema";
import { AssignDialog } from "@/components/nutrition/plan-editor/assign-dialog";

type TemplateRow = { id: string; name: string; calorieLevel: number; kind: PlanKind | null; uses: number; updatedAt: Date };
type PlanRow = {
  id: string;
  title: string;
  kcal: number | null;
  kind: PlanKind | null;
  published: boolean;
  pendingChanges: boolean;
  updatedAt: Date;
  member: { id: string; name: string };
};

export function PlansOverview({
  templates,
  plans,
}: {
  templates: TemplateRow[];
  plans: PlanRow[];
}) {
  const [assignId, setAssignId] = useState<TemplateRow | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/nutricion/planes/socio/nuevo" className={buttonVariants()}>
          + Plan para un socio
        </Link>
        <Link href="/dashboard/nutricion/planes/plantilla/nueva" className={buttonVariants({ variant: "outline" })}>
          + Nueva plantilla
        </Link>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plantillas por calorías</h2>
        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay plantillas. Crea una por nivel calórico (1400, 1600, 1800…) y asígnala a varios socios a la vez.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <Link href={`/dashboard/nutricion/planes/plantilla/${t.id}`} className="hover:underline">
                      {t.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {t.calorieLevel} kcal · {t.kind ? PLAN_KIND_LABEL[t.kind] : "vacía"} · usada {t.uses} {t.uses === 1 ? "vez" : "veces"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Link href={`/dashboard/nutricion/planes/plantilla/${t.id}`} className="text-sm font-medium hover:underline">
                    Editar
                  </Link>
                  <button type="button" className="text-sm font-medium hover:underline" onClick={() => setAssignId(t)}>
                    Asignar a socios
                  </button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Planes de socios</h2>
        {plans.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">Todavía no hay planes armados en la app.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {plans.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/nutricion/planes/socio/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{p.member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.title} · {p.kind ? PLAN_KIND_LABEL[p.kind] : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      !p.published ? "bg-muted text-muted-foreground" : p.pendingChanges ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {!p.published ? "Borrador" : p.pendingChanges ? "Cambios sin publicar" : "Publicado"}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {assignId && (
        <AssignDialog
          open
          onOpenChange={(o) => !o && setAssignId(null)}
          source={{ templateId: assignId.id }}
          sourceKcal={assignId.calorieLevel}
        />
      )}
    </div>
  );
}
