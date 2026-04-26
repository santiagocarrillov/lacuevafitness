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
    notes: member.notes ?? "",
  });

  function update(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await updateMember(memberId, form);
      toast.success("Información actualizada.");
      setOpen(false);
      router.refresh();
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
