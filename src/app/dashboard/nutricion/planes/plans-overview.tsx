"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createMemberPlan, createTemplate } from "@/lib/actions/meal-plans";
import { PLAN_KIND_LABEL, type PlanKind } from "@/lib/nutrition/plan-schema";
import { MemberMultiSearch, type PickedMember } from "@/components/nutrition/member-multi-search";
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

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function KindSelect({ value, onChange }: { value: PlanKind; onChange: (k: PlanKind) => void }) {
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value as PlanKind)}>
      <option value="MENU">Menú (comidas concretas con opciones)</option>
      <option value="EXCHANGES">Intercambios (porciones por grupo)</option>
    </select>
  );
}

export function PlansOverview({
  templates,
  plans,
  prefillMember,
}: {
  templates: TemplateRow[];
  plans: PlanRow[];
  prefillMember: PickedMember | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newTemplate, setNewTemplate] = useState(false);
  const [newPlan, setNewPlan] = useState(prefillMember !== null);
  const [assignId, setAssignId] = useState<TemplateRow | null>(null);

  const [tName, setTName] = useState("");
  const [tKcal, setTKcal] = useState("1600");
  const [tKind, setTKind] = useState<PlanKind>("MENU");

  const [pMember, setPMember] = useState<PickedMember[]>(prefillMember ? [prefillMember] : []);
  const [pFrom, setPFrom] = useState<string>("blank");
  const [pKind, setPKind] = useState<PlanKind>("MENU");
  const [pScale, setPScale] = useState(true);

  function createT() {
    startTransition(async () => {
      try {
        const { id } = await createTemplate({ name: tName || `${tKcal} kcal · ${PLAN_KIND_LABEL[tKind]}`, kind: tKind, calorieLevel: Number(tKcal) });
        router.push(`/dashboard/nutricion/planes/plantilla/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo crear.");
      }
    });
  }

  function createP() {
    const m = pMember[0];
    if (!m) {
      toast.error("Elige un socio.");
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await createMemberPlan({
          memberId: m.id,
          kind: pKind,
          templateId: pFrom === "blank" ? null : pFrom,
          scaleToTarget: pScale,
        });
        router.push(`/dashboard/nutricion/planes/socio/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo crear.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setNewPlan(true)}>+ Plan para un socio</Button>
        <Button variant="outline" onClick={() => setNewTemplate(true)}>
          + Nueva plantilla
        </Button>
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

      <Dialog open={newTemplate} onOpenChange={setNewTemplate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva plantilla</DialogTitle>
            <DialogDescription>Una base por nivel calórico que después asignas (y reescalas) a cada socio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label>Nombre</Label>
                <Input value={tName} onChange={(e) => setTName(e.target.value)} placeholder={`${tKcal} kcal · ${PLAN_KIND_LABEL[tKind]}`} />
              </div>
              <div className="space-y-1">
                <Label>kcal</Label>
                <Input inputMode="numeric" value={tKcal} onChange={(e) => setTKcal(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Formato</Label>
              <KindSelect value={tKind} onChange={setTKind} />
            </div>
            <div className="flex justify-end">
              <Button disabled={isPending} onClick={createT}>
                Crear y editar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newPlan} onOpenChange={setNewPlan}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plan para un socio</DialogTitle>
            <DialogDescription>Se crea como borrador: el socio no lo ve hasta que lo publiques.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Socio</Label>
              <MemberMultiSearch value={pMember} onChange={setPMember} multiple={false} autoFocus={!prefillMember} />
            </div>
            <div className="space-y-1">
              <Label>Partir de</Label>
              <select className={selectCls} value={pFrom} onChange={(e) => setPFrom(e.target.value)}>
                <option value="blank">Plan en blanco</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    Plantilla: {t.name}
                  </option>
                ))}
              </select>
            </div>
            {pFrom === "blank" ? (
              <div className="space-y-1">
                <Label>Formato</Label>
                <KindSelect value={pKind} onChange={setPKind} />
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pScale} onChange={(e) => setPScale(e.target.checked)} />
                Reescalar a la meta calórica del socio (si tiene)
              </label>
            )}
            <div className="flex justify-end">
              <Button disabled={isPending || pMember.length === 0} onClick={createP}>
                Crear y editar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
