"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { upsertMonthlyTarget } from "@/lib/actions/reports";
import { Sede } from "@/generated/prisma/client";

type Target = {
  revenueTargetCents: number;
  salesTarget: number;
  visitorsTarget: number;
  leadsTarget: number;
  attendanceTarget: number;
  workingDays: number;
  projectedICVPct: number;
} | null;

export function TargetsEditor({
  sede,
  year,
  month,
  current,
}: {
  sede: Sede;
  year: number;
  month: number;
  current: Target;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    revenueTarget: current ? (current.revenueTargetCents / 100).toString() : "4000",
    salesTarget: current?.salesTarget?.toString() ?? "24",
    visitorsTarget: current?.visitorsTarget?.toString() ?? "48",
    leadsTarget: current?.leadsTarget?.toString() ?? "450",
    attendanceTarget: current?.attendanceTarget?.toString() ?? "1200",
    workingDays: current?.workingDays?.toString() ?? "21",
    projectedICVPct: current?.projectedICVPct?.toString() ?? "50",
  });

  function update(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSave() {
    startTransition(async () => {
      await upsertMonthlyTarget({
        sede,
        year,
        month,
        revenueTargetCents: Math.round(parseFloat(form.revenueTarget) * 100),
        salesTarget: parseInt(form.salesTarget),
        visitorsTarget: parseInt(form.visitorsTarget),
        leadsTarget: parseInt(form.leadsTarget),
        attendanceTarget: parseInt(form.attendanceTarget),
        workingDays: parseInt(form.workingDays),
        projectedICVPct: parseFloat(form.projectedICVPct),
      });
      toast.success("Metas guardadas.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs text-orange-900 hover:underline font-normal">
        {current ? "Editar metas" : "+ Definir metas"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Metas — {new Date(year, month - 1).toLocaleDateString("es-EC", { month: "long", year: "numeric" })}</DialogTitle>
          <DialogDescription>
            Sede: {sede === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Meta Facturación ($)</Label>
              <Input type="number" value={form.revenueTarget} onChange={(e) => update("revenueTarget", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meta Ventas (#)</Label>
              <Input type="number" value={form.salesTarget} onChange={(e) => update("salesTarget", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meta Visitantes</Label>
              <Input type="number" value={form.visitorsTarget} onChange={(e) => update("visitorsTarget", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meta Averiguadores</Label>
              <Input type="number" value={form.leadsTarget} onChange={(e) => update("leadsTarget", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meta Asistencia</Label>
              <Input type="number" value={form.attendanceTarget} onChange={(e) => update("attendanceTarget", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Días hábiles</Label>
              <Input type="number" value={form.workingDays} onChange={(e) => update("workingDays", e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">ICV % proyectado</Label>
              <Input type="number" step="0.1" value={form.projectedICVPct} onChange={(e) => update("projectedICVPct", e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar metas"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
