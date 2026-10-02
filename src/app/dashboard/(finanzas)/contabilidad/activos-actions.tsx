"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { disposeFixedAsset, registerAssetFromLine, updateFixedAsset } from "@/lib/actions/fixed-assets";
import { ecuadorDateString } from "@/lib/timezone";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>, ok: string, done?: () => void) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        done?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo.");
      }
    });
  return { pending, run };
}

export function RegisterAssetButton({ lineId }: { lineId: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => registerAssetFromLine(lineId), "Activo registrado")}>
      Registrar
    </Button>
  );
}

export function AssetForms({ id, sede, name, usefulLifeMonths, residualCents }: { id: string; sede: string; name: string; usefulLifeMonths: number; residualCents: number }) {
  const router = useRouter();
  const back = () => router.push(`/dashboard/contabilidad?tab=activos&entidad=${sede}`);
  const { pending, run } = useRun();
  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(
            () => updateFixedAsset(id, {
              name: String(fd.get("name")),
              usefulLifeMonths: Number(fd.get("life")),
              residualCents: Math.round(Number(String(fd.get("residual")).replace(",", ".")) * 100),
            }),
            "Guardado",
            back,
          );
        }}
      >
        <h2 className="text-sm font-semibold">Datos</h2>
        <div className="space-y-1"><Label className="text-xs">Nombre</Label><Input name="name" className="h-8" defaultValue={name} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Vida útil (meses)</Label><Input name="life" type="number" min={1} className="h-8" defaultValue={usefulLifeMonths} /></div>
          <div className="space-y-1"><Label className="text-xs">Valor residual</Label><Input name="residual" inputMode="decimal" className="h-8" defaultValue={(residualCents / 100).toFixed(2)} /></div>
        </div>
        <div className="flex justify-end"><Button type="submit" disabled={pending}>Guardar</Button></div>
      </form>

      <form
        className="space-y-3 border-t pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => disposeFixedAsset(id, String(fd.get("date")), String(fd.get("note"))), "Activo dado de baja", back);
        }}
      >
        <h2 className="text-sm font-semibold">Dar de baja</h2>
        <p className="text-xs text-muted-foreground">Robo, daño o venta. Lo que falte por depreciar se registra como pérdida en esa fecha.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs">Fecha</Label><Input name="date" type="date" className="h-8" defaultValue={ecuadorDateString()} max={ecuadorDateString()} /></div>
          <div className="space-y-1"><Label className="text-xs">Motivo</Label><Input name="note" className="h-8" placeholder="Robo, daño, venta…" required /></div>
        </div>
        <div className="flex justify-end"><Button type="submit" variant="destructive" disabled={pending}>Dar de baja</Button></div>
      </form>
    </div>
  );
}
