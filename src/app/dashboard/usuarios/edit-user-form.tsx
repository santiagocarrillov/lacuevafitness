"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EditableUser = {
  id: string;
  fullName: string;
  role: string;
  sede: string | null;
  active: boolean;
};

const selectCls = "w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm disabled:opacity-50";

/** Full-page "editar usuario" (/dashboard/usuarios/[id]; was a popup). */
export function EditUserForm({ user, isSelf, backHref }: { user: EditableUser; isSelf: boolean; backHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    fullName: user.fullName,
    role: user.role,
    sede: user.sede ?? "",
    active: user.active,
  });

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sede: form.sede || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error al guardar.");
        return;
      }
      toast.success("Usuario actualizado.");
      router.push(backHref);
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-1">
        <Label>Nombre completo</Label>
        <Input required value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Rol</Label>
          <select value={form.role} onChange={(e) => update("role", e.target.value)} disabled={isSelf} className={selectCls}>
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
            <option value="">Ambas</option>
            <option value="FITNESS_CENTER">Fitness Center</option>
            <option value="XTREME">Xtreme</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          checked={form.active}
          disabled={isSelf}
          onChange={(e) => update("active", e.target.checked)}
          className="h-4 w-4 rounded border-input disabled:opacity-50"
        />
        <label htmlFor="active" className="text-sm">Cuenta activa</label>
      </div>
      {isSelf && <p className="text-xs text-muted-foreground">No puedes cambiar tu propio rol ni desactivarte.</p>}
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
