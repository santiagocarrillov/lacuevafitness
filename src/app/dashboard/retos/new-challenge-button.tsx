"use client";

import { useState, useTransition } from "react";
import { ecuadorDateString } from "@/lib/timezone";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createChallenge, enrollAllActiveMembers } from "@/lib/actions/challenges";
import { ChallengeFields, type ChallengeForm, isMetric } from "./challenge-fields";

export function NewChallengeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<ChallengeForm>({
    name: "",
    description: "",
    reward: "",
    ruleType: "TOTAL_CLASSES",
    ruleTarget: "30",
    ruleDays: "",
    metricTest: "",
    sede: "",
    startsAt: ecuadorDateString(),
    endsAt: "",
  });

  function update(field: keyof ChallengeForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const metric = isMetric(form.ruleType);
    if (!form.name || !form.startsAt || !form.endsAt || (!metric && !form.ruleTarget)) {
      toast.error("Completa nombre, meta, fecha de inicio y fin.");
      return;
    }
    startTransition(async () => {
      try {
        const challenge = await createChallenge({
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

        if (metric) {
          // Metric rankings are computed live from SRXFIT data — no enrollment.
          toast.success("Reto de ranking creado. El podio se calcula con los datos SRXFIT.");
        } else {
          const enrolled = await enrollAllActiveMembers(challenge.id);
          toast.success(`Reto creado. ${enrolled} socios inscritos automáticamente.`);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al crear el reto.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-7 px-2.5">
        + Nuevo reto
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear reto</DialogTitle>
          <DialogDescription>
            Retos de asistencia inscriben a todos los socios activos. Los retos SRXFIT arman un ranking en vivo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <ChallengeFields form={form} update={update} />
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creando…" : "Crear reto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
