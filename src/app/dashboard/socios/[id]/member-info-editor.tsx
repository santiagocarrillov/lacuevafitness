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
import { updateMember } from "@/lib/actions/members";
import type { Sede } from "@/generated/prisma/client";

type MemberData = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  address: string | null;
  occupation: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  sede: string;
  secondarySede: string | null;
  notes: string | null;
};

export function MemberInfoEditor({
  memberId,
  member,
}: {
  memberId: string;
  member: MemberData;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    firstName: member.firstName ?? "",
    lastName: member.lastName ?? "",
    email: member.email ?? "",
    phone: member.phone ?? "",
    dateOfBirth: member.dateOfBirth ? member.dateOfBirth.split("T")[0] : "",
    address: member.address ?? "",
    occupation: member.occupation ?? "",
    emergencyName: member.emergencyName ?? "",
    emergencyPhone: member.emergencyPhone ?? "",
    sede: member.sede,
    secondarySede: member.secondarySede ?? "",
    notes: member.notes ?? "",
  });

  function update(field: string, value: string) {
    setForm((p) => {
      const next = { ...p, [field]: value };
      // Secondary can't equal primary — clear it if they collide.
      if (next.secondarySede && next.secondarySede === next.sede) next.secondarySede = "";
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const { sede, secondarySede, ...rest } = form;
    startTransition(async () => {
      try {
        await updateMember(memberId, {
          ...rest,
          sede: sede as Sede,
          secondarySede: secondarySede ? (secondarySede as Sede) : null,
        });
        toast.success("Información actualizada.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        // e.g. email already used by another socio — keep the dialog open so the
        // admin can fix the field instead of crashing the page (bug #5).
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar la información.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs text-primary hover:underline">
        Editar
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar información personal</DialogTitle>
          <DialogDescription>
            Actualiza los datos del socio.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input required value={form.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Apellido *</Label>
              <Input required value={form.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono</Label>
              <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha de nacimiento</Label>
              <Input type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ocupación</Label>
              <Input value={form.occupation} onChange={(e) => update("occupation", e.target.value)} placeholder="ej: Ingeniero, Médico..." />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Dirección</Label>
              <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contacto de emergencia</Label>
              <Input value={form.emergencyName} onChange={(e) => update("emergencyName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono emergencia</Label>
              <Input value={form.emergencyPhone} onChange={(e) => update("emergencyPhone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sede principal (cobro y reportes)</Label>
              <select
                value={form.sede}
                onChange={(e) => update("sede", e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="FITNESS_CENTER">Fitness Center</option>
                <option value="XTREME">Xtreme</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sede secundaria (solo asistencia)</Label>
              <select
                value={form.secondarySede}
                onChange={(e) => update("secondarySede", e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="">Ninguna</option>
                {form.sede !== "FITNESS_CENTER" && <option value="FITNESS_CENTER">Fitness Center</option>}
                {form.sede !== "XTREME" && <option value="XTREME">Xtreme</option>}
              </select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Notas</Label>
              <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Restricciones médicas, preferencias..." />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
