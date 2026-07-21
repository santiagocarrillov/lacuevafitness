"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { updateChallenge, deleteChallenge } from "@/lib/actions/challenges";
import { ChallengeFields, type ChallengeForm, isMetric } from "./challenge-fields";

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  reward: string | null;
  ruleType: string;
  ruleTarget: number | null;
  ruleDays: number | null;
  metricTest: string | null;
  sede: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
};

function isoDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function EditChallengeDialog({ challenge }: { challenge: Challenge }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<ChallengeForm>({
    name: challenge.name,
    description: challenge.description ?? "",
    reward: challenge.reward ?? "",
    ruleType: challenge.ruleType,
    ruleTarget: challenge.ruleTarget != null ? String(challenge.ruleTarget) : "",
    ruleDays: challenge.ruleDays != null ? String(challenge.ruleDays) : "",
    metricTest: challenge.metricTest ?? "",
    sede: challenge.sede ?? "",
    startsAt: isoDate(challenge.startsAt),
    endsAt: isoDate(challenge.endsAt),
  });

  function update(field: keyof ChallengeForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleDelete() {
    if (!confirm("¿Borrar este reto? Dejará de verse para socios y admins.")) return;
    startTransition(async () => {
      try {
        await deleteChallenge(challenge.id);
        toast.success("Reto borrado.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al borrar.");
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const metric = isMetric(form.ruleType);
    if (!form.name || !form.startsAt || !form.endsAt || (!metric && !form.ruleTarget)) {
      toast.error("Completa nombre, meta, fecha de inicio y fin.");
      return;
    }
    startTransition(async () => {
      try {
        await updateChallenge(challenge.id, {
          name: form.name,
          description: form.description || undefined,
          reward: form.reward || undefined,
          ruleType: form.ruleType as never,
          ruleTarget: form.ruleTarget ? parseFloat(form.ruleTarget) : null,
          ruleDays: form.ruleDays ? parseInt(form.ruleDays) : undefined,
          metricTest: form.metricTest ? (form.metricTest as never) : null,
          sede: form.sede ? (form.sede as never) : undefined,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
        });
        toast.success("Reto actualizado.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs text-muted-foreground hover:text-foreground transition">
        editar
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar reto</DialogTitle>
          <DialogDescription>
            Corrige los datos del reto. Al guardar se recalcula el ranking de asistencia.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <ChallengeFields form={form} update={update} />
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10">
              Borrar reto
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
