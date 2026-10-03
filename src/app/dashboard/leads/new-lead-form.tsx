"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLead } from "@/lib/actions/leads";
import type { LeadSource, Sede } from "@/generated/prisma/enums";

const sources: { value: LeadSource; label: string }[] = [
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

const selectCls = "w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm disabled:opacity-60";

/** Full-page "registrar lead" (was a popup on /dashboard/leads). */
export function NewLeadForm({
  defaultSede,
  canPickSede,
  backHref,
}: {
  defaultSede: Sede;
  canPickSede: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    sede: defaultSede as Sede,
    source: "INSTAGRAM" as LeadSource,
    notes: "",
  });

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    startTransition(async () => {
      try {
        const lead = await createLead(form);
        toast.success(`Lead ${form.firstName} registrado.`);
        router.push(backHref === "/dashboard/leads" ? `/dashboard/leads/${lead.id}` : backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo registrar el lead.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nombre *</Label>
          <Input required autoFocus value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Apellido</Label>
          <Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Teléfono</Label>
          <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Sede</Label>
          <select
            value={form.sede}
            onChange={(e) => update("sede", e.target.value as Sede)}
            disabled={!canPickSede}
            className={selectCls}
          >
            <option value="FITNESS_CENTER">Fitness Center</option>
            <option value="XTREME">Xtreme</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Canal de origen *</Label>
          <select value={form.source} onChange={(e) => update("source", e.target.value as LeadSource)} className={selectCls}>
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
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Registrar lead"}
        </Button>
      </div>
    </form>
  );
}
