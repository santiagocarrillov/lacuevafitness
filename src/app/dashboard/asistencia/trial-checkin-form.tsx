"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordTrialAttendance, type TrialMemberDraft } from "@/lib/actions/attendance";

export type TrialCheckinLead = {
  leadId: string;
  /** Name as it shows in WhatsApp (often an alias with emojis). */
  name: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Alta del socio en el mostrador, al registrar su evaluación
 * (/dashboard/asistencia/alta; antes era un popup).
 *
 * El nombre que trae el lead viene del perfil de WhatsApp y suele ser un alias con
 * emojis. Si se registra tal cual, ese alias queda de por vida en reportes, portal
 * y facturación — por eso aquí se confirma cara a cara antes de crear al socio.
 *
 * Obligatorio: nombre y apellido. El resto (email, teléfono, nacimiento) es
 * opcional y se completa al cerrar la venta; no vale frenar un check-in por eso.
 * Si falla (email repetido, apellido vacío) la pantalla se queda para corregir.
 */
export function TrialCheckinForm({
  scheduleId,
  lead,
  windowOpen,
  backHref,
}: {
  scheduleId: string;
  lead: TrialCheckinLead;
  windowOpen: boolean;
  backHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<TrialMemberDraft>({
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    dateOfBirth: "",
  });

  const set = (field: keyof TrialMemberDraft, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const draft: TrialMemberDraft = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
    };
    startTransition(async () => {
      try {
        const { memberName } = await recordTrialAttendance(scheduleId, lead.leadId, draft);
        toast.success(`${memberName} registrada: asistió a su evaluación ✅`);
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo registrar.");
      }
    });
  }

  const nombreWhatsApp = lead.name;
  const cambio = nombreWhatsApp && `${form.firstName} ${form.lastName}`.trim() !== nombreWhatsApp;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!windowOpen && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          🔒 Ventana de registro cerrada (después de las 9:30pm). No se pueden ingresar asistencias.
        </div>
      )}
      {nombreWhatsApp && (
        <p className="text-xs text-muted-foreground">
          En WhatsApp aparece como <span className="font-medium">{nombreWhatsApp}</span>
          {cambio ? " — se reemplazará por lo que escribas aquí." : ""}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Nombre *</Label>
          <Input required autoFocus value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Apellido *</Label>
          <Input required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Teléfono</Label>
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Fecha de nacimiento</Label>
          <Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth", e.target.value)} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Solo nombre y apellido son obligatorios. Lo demás se completa al cerrar la
        venta. Entra como socio <span className="font-medium">en evaluación</span>:
        no cuenta en socios activos hasta que pague su mensualidad.
      </p>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending || !windowOpen}>
          {isPending ? "Registrando…" : "Registrar asistencia"}
        </Button>
      </div>
    </form>
  );
}
