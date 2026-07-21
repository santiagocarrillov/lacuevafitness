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
import { updateChallenge, deleteChallenge } from "@/lib/actions/challenges";

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  reward: string | null;
  ruleType: string;
  ruleTarget: number;
  ruleDays: number | null;
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
  const [form, setForm] = useState({
    name: challenge.name,
    description: challenge.description ?? "",
    reward: challenge.reward ?? "",
    ruleType: challenge.ruleType,
    ruleTarget: String(challenge.ruleTarget),
    ruleDays: challenge.ruleDays != null ? String(challenge.ruleDays) : "",
    sede: challenge.sede ?? "",
    startsAt: isoDate(challenge.startsAt),
    endsAt: isoDate(challenge.endsAt),
  });

  function update(field: keyof typeof form, value: string) {
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
    if (!form.name || !form.ruleTarget || !form.startsAt || !form.endsAt) {
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
          ruleTarget: parseInt(form.ruleTarget),
          ruleDays: form.ruleDays ? parseInt(form.ruleDays) : undefined,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar reto</DialogTitle>
          <DialogDescription>
            Corrige los datos del reto. No cambia las inscripciones existentes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre del reto *</Label>
            <Input required placeholder='ej: "Reto 30 clases"' value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Descripción</Label>
            <Input placeholder='ej: "Asiste a 30 clases en 60 días"' value={form.description} onChange={(e) => update("description", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Recompensa</Label>
            <Input placeholder='ej: "Camiseta La Cueva"' value={form.reward} onChange={(e) => update("reward", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Tipo de regla *</Label>
              <select value={form.ruleType} onChange={(e) => update("ruleType", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
                <option value="TOTAL_CLASSES">X clases totales</option>
                <option value="CONSECUTIVE_CLASSES">X clases consecutivas</option>
                <option value="CLASSES_IN_DAYS">X clases en Y días</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Meta (# clases) *</Label>
              <Input type="number" required min={1} value={form.ruleTarget} onChange={(e) => update("ruleTarget", e.target.value)} />
            </div>
          </div>
          {form.ruleType === "CLASSES_IN_DAYS" && (
            <div className="space-y-1">
              <Label>En cuántos días</Label>
              <Input type="number" min={1} value={form.ruleDays} onChange={(e) => update("ruleDays", e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Sede</Label>
              <select value={form.sede} onChange={(e) => update("sede", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
                <option value="">Ambas sedes</option>
                <option value="FITNESS_CENTER">Fitness Center</option>
                <option value="XTREME">Xtreme</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Fecha inicio *</Label>
              <Input type="date" required value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Fecha fin *</Label>
              <Input type="date" required value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} />
            </div>
          </div>
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
