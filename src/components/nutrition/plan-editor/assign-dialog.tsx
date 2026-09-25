"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assignPlanToMembers } from "@/lib/actions/meal-plans";
import { MemberMultiSearch, type PickedMember } from "@/components/nutrition/member-multi-search";

/** Share a template or a plan with one or many socios (one independent copy each). */
export function AssignDialog({
  open,
  onOpenChange,
  source,
  sourceKcal,
  exclude = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  source: { templateId: string } | { planId: string };
  sourceKcal: number;
  exclude?: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [members, setMembers] = useState<PickedMember[]>([]);
  const [scale, setScale] = useState(true);
  const [publishNow, setPublishNow] = useState(false);

  function submit() {
    const ids = members.map((m) => m.id).filter((id) => !exclude.includes(id));
    if (ids.length === 0) {
      toast.error("Elige al menos un socio.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await assignPlanToMembers({ ...source, memberIds: ids, scaleToTarget: scale, publishNow });
        toast.success(
          `${r.created} ${r.created === 1 ? "plan creado" : "planes creados"}` +
            (scale ? ` · ${r.scaled} reescalados a su meta` : "") +
            (publishNow ? " y publicados" : " como borrador"),
        );
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo asignar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar a socios</DialogTitle>
          <DialogDescription>
            Cada socio recibe su propia copia ({sourceKcal} kcal): lo que ajustes después en uno no cambia a los demás.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <MemberMultiSearch value={members} onChange={setMembers} autoFocus />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={scale} onChange={(e) => setScale(e.target.checked)} />
            <span>
              Reescalar a la meta de cada socio
              <span className="block text-xs text-muted-foreground">
                Si el socio tiene meta calórica guardada, se ajustan gramos e intercambios. Si no, queda en {sourceKcal} kcal.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={publishNow} onChange={(e) => setPublishNow(e.target.checked)} />
            <span>
              Publicar de una vez
              <span className="block text-xs text-muted-foreground">
                Si no, quedan como borrador para que los revises uno por uno. Publicar reemplaza su plan actual y les llega un aviso.
              </span>
            </span>
          </label>
          <div className="flex justify-end">
            <Button disabled={isPending || members.length === 0} onClick={submit}>
              {isPending ? "Asignando…" : `Asignar a ${members.length || ""} ${members.length === 1 ? "socio" : "socios"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
