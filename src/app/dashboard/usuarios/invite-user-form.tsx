"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectCls = "w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm";

/**
 * Full-page "invitar usuario" (/dashboard/usuarios/nuevo; was a popup). After
 * creating the account the same screen shows the temporary credentials.
 */
export function InviteUserForm({ backHref }: { backHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    role: "ADMIN",
    sede: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.fullName) {
      toast.error("Email y nombre son obligatorios.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          fullName: form.fullName,
          role: form.role,
          sede: form.sede || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al crear usuario.");
        return;
      }
      const data = await res.json();
      setCreated({ email: form.email, password: data.password });
      toast.success("Usuario creado.");
    });
  }

  if (created) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="font-medium">Usuario creado</p>
          <p className="text-sm text-muted-foreground">
            Comparte estos datos con la persona. Puede cambiar la contraseña después.
          </p>
        </div>
        <div className="rounded-md border p-3 space-y-2 bg-muted/40">
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-mono text-sm">{created.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Contraseña temporal</p>
            <p className="font-mono text-sm select-all">{created.password}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(`Email: ${created.email}\nContraseña: ${created.password}`);
              toast.success("Copiado al portapapeles.");
            }}
          >
            Copiar
          </Button>
          <Button onClick={() => router.push(backHref)}>Listo</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      <div className="space-y-1">
        <Label>Email *</Label>
        <Input type="email" required autoFocus value={form.email} onChange={(e) => update("email", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Nombre completo *</Label>
        <Input required value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Rol</Label>
          <select value={form.role} onChange={(e) => update("role", e.target.value)} className={selectCls}>
            <option value="OWNER">Fundador</option>
            <option value="ACCOUNTING">Contabilidad</option>
            <option value="ADMIN">Administrador</option>
            <option value="COACH">Coach</option>
            <option value="NUTRITIONIST">Nutricionista</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Sede</Label>
          <select value={form.sede} onChange={(e) => update("sede", e.target.value)} className={selectCls}>
            <option value="">Ambas (OWNER/ACCOUNTING)</option>
            <option value="FITNESS_CENTER">Fitness Center</option>
            <option value="XTREME">Xtreme</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando…" : "Crear usuario"}
        </Button>
      </div>
    </form>
  );
}
