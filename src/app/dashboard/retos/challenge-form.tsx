"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ecuadorDateString } from "@/lib/timezone";
import { createChallenge, enrollAllActiveMembers, updateChallenge, deleteChallenge } from "@/lib/actions/challenges";
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

function toInput(form: ChallengeForm) {
  return {
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
  };
}

function isIncomplete(form: ChallengeForm) {
  const metric = isMetric(form.ruleType);
  return !form.name || !form.startsAt || !form.endsAt || (!metric && !form.ruleTarget);
}

/** Full-page "Crear reto" (replaces the popup on Retos). */
export function NewChallengeForm({ backHref }: { backHref: string }) {
  const router = useRouter();
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isIncomplete(form)) {
      toast.error("Completa nombre, meta, fecha de inicio y fin.");
      return;
    }
    const metric = isMetric(form.ruleType);
    startTransition(async () => {
      try {
        const challenge = await createChallenge(toInput(form));

        if (metric) {
          // Metric rankings are computed live from SRXFIT data — no enrollment.
          toast.success("Reto de ranking creado. El podio se calcula con los datos SRXFIT.");
        } else {
          const enrolled = await enrollAllActiveMembers(challenge.id);
          toast.success(`Reto creado. ${enrolled} socios inscritos automáticamente.`);
        }
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al crear el reto.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <ChallengeFields form={form} update={update} />
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(backHref)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando…" : "Crear reto"}
        </Button>
      </div>
    </form>
  );
}

/** Full-page "Editar reto" (replaces the popup on Retos). */
export function EditChallengeForm({ challenge, backHref }: { challenge: Challenge; backHref: string }) {
  const router = useRouter();
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
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al borrar.");
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isIncomplete(form)) {
      toast.error("Completa nombre, meta, fecha de inicio y fin.");
      return;
    }
    startTransition(async () => {
      try {
        await updateChallenge(challenge.id, toInput(form));
        toast.success("Reto actualizado.");
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <ChallengeFields form={form} update={update} />
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending}
          className="text-destructive hover:text-destructive hover:bg-destructive/10">
          Borrar reto
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(backHref)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </form>
  );
}
