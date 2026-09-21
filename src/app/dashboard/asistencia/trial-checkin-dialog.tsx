"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { TrialLeadRow, TrialMemberDraft } from "@/lib/actions/attendance";

/**
 * Alta del socio en el mostrador, al registrar su evaluación.
 *
 * El nombre que trae el lead viene del perfil de WhatsApp y suele ser un alias con
 * emojis. Si se registra tal cual, ese alias queda de por vida en reportes, portal
 * y facturación — por eso aquí se confirma cara a cara antes de crear al socio.
 *
 * Obligatorio: nombre y apellido. El resto (email, teléfono, nacimiento) es
 * opcional y se completa al cerrar la venta; no vale frenar un check-in por eso.
 */
export function TrialCheckinDialog({
  lead,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  lead: TrialLeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (draft: TrialMemberDraft) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<TrialMemberDraft>({ firstName: "", lastName: "" });
  // Cada lead que se abre recarga el formulario con SUS datos.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (lead && loadedFor !== lead.leadId) {
    setLoadedFor(lead.leadId);
    setForm({
      firstName: lead.firstName ?? "",
      lastName: lead.lastName ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      dateOfBirth: "",
    });
  }

  const set = (field: keyof TrialMemberDraft, value: string) =>
    setForm((p) => ({ ...p, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
    });
  }

  const nombreWhatsApp = lead?.name ?? "";
  const cambio =
    nombreWhatsApp && `${form.firstName} ${form.lastName}`.trim() !== nombreWhatsApp;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar evaluación y dar de alta</DialogTitle>
          <DialogDescription>
            Confirma el nombre real con la persona antes de crear al socio. Se guarda
            así en reportes, portal y facturación.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {nombreWhatsApp && (
            <p className="text-xs text-muted-foreground">
              En WhatsApp aparece como <span className="font-medium">{nombreWhatsApp}</span>
              {cambio ? " — se reemplazará por lo que escribas aquí." : ""}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input
                required
                autoFocus
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Apellido *</Label>
              <Input
                required
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono</Label>
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Fecha de nacimiento</Label>
              <Input
                type="date"
                value={form.dateOfBirth ?? ""}
                onChange={(e) => set("dateOfBirth", e.target.value)}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Solo nombre y apellido son obligatorios. Lo demás se completa al cerrar la
            venta. Entra como socio <span className="font-medium">en evaluación</span>:
            no cuenta en socios activos hasta que pague su mensualidad.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando…" : "Registrar asistencia"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
