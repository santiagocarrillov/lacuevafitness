"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLead } from "@/lib/actions/leads";
import type { LeadSource } from "@/generated/prisma/enums";

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

const selectCls = "w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm";

type LeadForm = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: LeadSource;
  notes: string;
  trialScheduledAt: string;
  trialAttended: boolean | null;
  lostReason: string;
  ownerUserId: string;
};

export function EditLeadForm({ lead, staff }: { lead: LeadForm; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const back = `/dashboard/leads/${lead.id}`;
  const [pending, start] = useTransition();
  const [form, setForm] = useState(lead);
  const set = <K extends keyof LeadForm>(k: K, v: LeadForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    start(async () => {
      try {
        await updateLead(lead.id, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          source: form.source,
          notes: form.notes,
          lostReason: form.lostReason,
          // Ecuador no tiene horario de verano: la hora local es siempre UTC-5.
          trialScheduledAt: form.trialScheduledAt ? `${form.trialScheduledAt}:00-05:00` : undefined,
          trialAttended: form.trialAttended ?? undefined,
          ownerUserId: form.ownerUserId || null,
        });
        toast.success("Lead actualizado.");
        router.push(back);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Nombre *</Label>
          <Input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Apellido</Label>
          <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Teléfono</Label>
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Canal de origen</Label>
          <select value={form.source} onChange={(e) => set("source", e.target.value as LeadSource)} className={selectCls}>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Responsable</Label>
          <select value={form.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)} className={selectCls}>
            <option value="">Sin asignar</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Evaluación agendada</Label>
          <Input type="datetime-local" value={form.trialScheduledAt} onChange={(e) => set("trialScheduledAt", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>¿Vino a la evaluación?</Label>
          <select
            value={form.trialAttended == null ? "" : form.trialAttended ? "yes" : "no"}
            onChange={(e) => set("trialAttended", e.target.value === "" ? null : e.target.value === "yes")}
            className={selectCls}
          >
            <option value="">Sin registrar</option>
            <option value="yes">Sí vino</option>
            <option value="no">No vino</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notas</Label>
        <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Motivo de pérdida (si se perdió)</Label>
        <Input value={form.lostReason} onChange={(e) => set("lostReason", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(back)} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
