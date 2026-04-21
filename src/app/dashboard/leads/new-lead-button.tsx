"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createLead } from "@/lib/actions/leads";

const sources = [
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE_CALL", label: "Llamada" },
  { value: "WEB_FORM", label: "Web" },
  { value: "WALK_IN", label: "Visita directa" },
  { value: "REFERRAL", label: "Referido" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "OTHER", label: "Otro" },
];

export function NewLeadButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    sede: "FITNESS_CENTER",
    source: "INSTAGRAM",
    notes: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    startTransition(async () => {
      await createLead({
        ...form,
        sede: form.sede as any,
        source: form.source as any,
      });
      toast.success(`Lead ${form.firstName} registrado.`);
      setOpen(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", sede: "FITNESS_CENTER", source: "INSTAGRAM", notes: "" });
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-7 px-2.5">
        + Nuevo lead
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar lead</DialogTitle>
          <DialogDescription>
            Nuevo prospecto por cualquier canal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nombre *</Label>
              <Input required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Apellido</Label>
              <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Sede</Label>
              <select value={form.sede} onChange={(e) => update("sede", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
                <option value="FITNESS_CENTER">Fitness Center</option>
                <option value="XTREME">Xtreme</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Canal de origen *</Label>
              <select value={form.source} onChange={(e) => update("source", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
                {sources.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="¿Qué preguntó? ¿Cómo se enteró?" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Registrar lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
