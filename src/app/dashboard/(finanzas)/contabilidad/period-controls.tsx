"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { closePeriod, reopenPeriod } from "@/lib/actions/accounting";

export function PeriodControls({
  sede, ym, monthName, lockedThrough, canClose, isOwner,
}: { sede: string; ym: string; monthName: string; lockedThrough: string | null; canClose: boolean; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo completar.");
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {lockedThrough ? `Cerrado hasta el ${lockedThrough}` : "Ningún mes cerrado"}
      </span>
      {canClose && (
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`¿Cerrar ${monthName}? Lo contabilizado hasta fin de mes ya no se podrá modificar.`)) return;
            run(() => closePeriod(sede, ym), `${monthName} cerrado.`);
          }}
        >
          Cerrar {monthName}
        </Button>
      )}
      {isOwner && lockedThrough && (
        <Button
          size="xs"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("¿Reabrir el último mes cerrado?")) return;
            run(() => reopenPeriod(sede), "Mes reabierto.");
          }}
        >
          Reabrir
        </Button>
      )}
    </div>
  );
}
