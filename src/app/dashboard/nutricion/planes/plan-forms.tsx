"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMemberPlan, createTemplate } from "@/lib/actions/meal-plans";
import { PLAN_KIND_LABEL, type PlanKind } from "@/lib/nutrition/plan-schema";
import { MemberMultiSearch, type PickedMember } from "@/components/nutrition/member-multi-search";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function KindSelect({ value, onChange }: { value: PlanKind; onChange: (k: PlanKind) => void }) {
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value as PlanKind)}>
      <option value="MENU">Menú (comidas concretas con opciones)</option>
      <option value="EXCHANGES">Intercambios (porciones por grupo)</option>
    </select>
  );
}

/** Full-page "Nueva plantilla": creates it and opens the template editor. */
export function NewTemplateForm({ backHref }: { backHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tName, setTName] = useState("");
  const [tKcal, setTKcal] = useState("1600");
  const [tKind, setTKind] = useState<PlanKind>("MENU");

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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 space-y-1">
          <Label>Nombre</Label>
          <Input autoFocus value={tName} onChange={(e) => setTName(e.target.value)} placeholder={`${tKcal} kcal · ${PLAN_KIND_LABEL[tKind]}`} />
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(backHref)}>
          Cancelar
        </Button>
        <Button disabled={isPending} onClick={createT}>
          Crear y editar
        </Button>
      </div>
    </div>
  );
}

/** Full-page "Plan para un socio": creates a draft plan and opens the plan editor. */
export function NewMemberPlanForm({
  templates,
  prefillMember,
  backHref,
}: {
  templates: { id: string; name: string }[];
  prefillMember: PickedMember | null;
  backHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pMember, setPMember] = useState<PickedMember[]>(prefillMember ? [prefillMember] : []);
  const [pFrom, setPFrom] = useState<string>("blank");
  const [pKind, setPKind] = useState<PlanKind>("MENU");
  const [pScale, setPScale] = useState(true);

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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(backHref)}>
          Cancelar
        </Button>
        <Button disabled={isPending || pMember.length === 0} onClick={createP}>
          Crear y editar
        </Button>
      </div>
    </div>
  );
}
