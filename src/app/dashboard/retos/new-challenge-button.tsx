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
import { createChallenge, enrollAllActiveMembers } from "@/lib/actions/challenges";

export function NewChallengeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    description: "",
    reward: "",
    ruleType: "TOTAL_CLASSES",
    ruleTarget: "30",
    ruleDays: "",
    sede: "",
    startsAt: new Date().toISOString().split("T")[0],
    endsAt: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.ruleTarget || !form.startsAt || !form.endsAt) {
      toast.error("Completa nombre, meta, fecha de inicio y fin.");
      return;
    }
    startTransition(async () => {
      const challenge = await createChallenge({
        name: form.name,
        description: form.description || undefined,
        reward: form.reward || undefined,
        ruleType: form.ruleType as any,
        ruleTarget: parseInt(form.ruleTarget),
        ruleDays: form.ruleDays ? parseInt(form.ruleDays) : undefined,
        sede: form.sede ? (form.sede as any) : undefined,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
      });

      // Auto-enroll all active members
      const enrolled = await enrollAllActiveMembers(challenge.id);
      toast.success(`Reto creado. ${enrolled} socios inscritos automáticamente.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-7 px-2.5">
        + Nuevo reto
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear reto</DialogTitle>
          <DialogDescription>
            Todos los socios activos se inscribirán automáticamente.
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
