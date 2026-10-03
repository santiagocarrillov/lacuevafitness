"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  upsertSessionOverride,
  deleteSessionOverride,
} from "@/lib/actions/srxfit-overrides";

type Props = {
  backHref: string;
  weekNumber: number;
  dayIndex: number;
  initial: {
    activacionMd: string;
    fuerzaMd: string;
    acondicionamientoMd: string;
    regulacionMd: string;
    coachNotesMd: string;
  };
  hasOverride: boolean;
};

const FIELDS: Array<{ key: keyof Props["initial"]; label: string }> = [
  { key: "activacionMd",        label: "① Activación" },
  { key: "fuerzaMd",            label: "② Fuerza" },
  { key: "acondicionamientoMd", label: "③ Acondicionamiento" },
  { key: "regulacionMd",        label: "④ Regulación" },
  { key: "coachNotesMd",        label: "Nota para el coach" },
];

/** Full-page editor for one SRXFIT session (replaces the popup from the calendar). */
export function SessionForm({ backHref, weekNumber, dayIndex, initial, hasOverride }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function update(key: keyof Props["initial"], val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const payload: Record<string, string | null> = {};
        for (const { key } of FIELDS) {
          const v = form[key].trim();
          payload[key] = v || null;
        }
        await upsertSessionOverride(weekNumber, dayIndex, payload as Parameters<typeof upsertSessionOverride>[2]);
        toast.success("Programación guardada.");
        router.push(backHref);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function handleRestore() {
    if (!confirm("¿Restaurar la programación original? Tus ediciones se borrarán.")) return;
    startDelete(async () => {
      try {
        await deleteSessionOverride(weekNumber, dayIndex);
        toast.success("Programación restaurada al original.");
        router.push(backHref);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al restaurar");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">{label}</label>
            <textarea
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
              rows={key === "coachNotesMd" ? 3 : 8}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
              placeholder={key === "coachNotesMd" ? "Notas opcionales para el coach…" : "(vacío = ocultar bloque)"}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-3 border-t">
        {hasOverride ? (
          <Button
            variant="outline"
            onClick={handleRestore}
            disabled={isDeleting || isPending}
            className="text-red-600 hover:text-red-700"
          >
            {isDeleting ? "Restaurando…" : "Restaurar original"}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" disabled={isPending || isDeleting} onClick={() => router.push(backHref)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
