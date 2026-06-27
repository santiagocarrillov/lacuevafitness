"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createMember } from "@/lib/actions/members";
import type { Sede } from "@/generated/prisma/client";

export default function NuevoSocioPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    occupation: "",
    emergencyName: "",
    emergencyPhone: "",
    sede: "FITNESS_CENTER",
    secondarySede: "",
    notes: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName || !form.lastName) {
      toast.error("Nombre y apellido son obligatorios.");
      return;
    }
    startTransition(async () => {
      try {
        const member = await createMember({
          ...form,
          sede: form.sede as Sede,
          secondarySede: form.secondarySede ? (form.secondarySede as Sede) : null,
        });
        toast.success(`${member.firstName} ${member.lastName} registrado.`);
        router.push(`/dashboard/socios/${member.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo crear el socio.");
      }
    });
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Nuevo socio</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos del miembro</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre *</Label>
                <Input
                  id="firstName"
                  required
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Apellido *</Label>
                <Input
                  id="lastName"
                  required
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => update("dateOfBirth", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sede">Sede principal *</Label>
                <select
                  id="sede"
                  value={form.sede}
                  onChange={(e) => update("sede", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm"
                >
                  <option value="FITNESS_CENTER">La Cueva Fitness Center</option>
                  <option value="XTREME">La Cueva Xtreme</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondarySede">Sede secundaria (solo asistencia)</Label>
                <select
                  id="secondarySede"
                  value={form.secondarySede}
                  onChange={(e) => update("secondarySede", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm"
                >
                  <option value="">Ninguna</option>
                  {form.sede !== "FITNESS_CENTER" && <option value="FITNESS_CENTER">La Cueva Fitness Center</option>}
                  {form.sede !== "XTREME" && <option value="XTREME">La Cueva Xtreme</option>}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address">Dirección</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="occupation">Ocupación</Label>
                <Input
                  id="occupation"
                  value={form.occupation}
                  onChange={(e) => update("occupation", e.target.value)}
                  placeholder="ej: Ingeniero, Médico..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emergencyName">Contacto de emergencia</Label>
                <Input
                  id="emergencyName"
                  value={form.emergencyName}
                  onChange={(e) => update("emergencyName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emergencyPhone">Tel. emergencia</Label>
                <Input
                  id="emergencyPhone"
                  value={form.emergencyPhone}
                  onChange={(e) => update("emergencyPhone", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Input
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Observaciones, restricciones médicas, etc."
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Guardando…" : "Registrar socio"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard/socios")}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
