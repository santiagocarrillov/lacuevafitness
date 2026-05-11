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

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  sede: string | null;
  active: boolean;
};

// ─── Edit dialog ──────────────────────────────────────────────────────

export function EditUserButton({ user, currentUserId }: { user: UserRow; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    fullName: user.fullName,
    role: user.role,
    sede: user.sede ?? "",
    active: user.active,
  });

  function update(field: string, value: string | boolean) {
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
        const err = await res.json();
        toast.error(err.error ?? "Error al guardar.");
        return;
      }
      toast.success("Usuario actualizado.");
      setOpen(false);
      router.refresh();
    });
  }

  const isSelf = user.id === currentUserId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs text-muted-foreground hover:text-foreground transition underline underline-offset-2">
        Editar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Nombre completo</Label>
            <Input
              required
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Rol</Label>
              <select
                value={form.role}
                onChange={(e) => update("role", e.target.value)}
                disabled={isSelf}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm disabled:opacity-50"
              >
                <option value="OWNER">Fundador</option>
                <option value="ACCOUNTING">Contabilidad</option>
                <option value="ADMIN">Administrador</option>
                <option value="COACH">Coach</option>
                <option value="NUTRITIONIST">Nutricionista</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Sede</Label>
              <select
                value={form.sede}
                onChange={(e) => update("sede", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm"
              >
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
          {isSelf && (
            <p className="text-xs text-muted-foreground">No puedes cambiar tu propio rol ni desactivarte.</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reset password ───────────────────────────────────────────────────

export function ResetPasswordButton({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [newPassword, setNewPassword] = useState<string | null>(null);

  function handleReset() {
    startTransition(async () => {
      const res = await fetch(`/api/users/${user.id}/reset-password`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Error al resetear contraseña.");
        return;
      }
      const data = await res.json();
      setNewPassword(data.password);
    });
  }

  function handleClose() {
    setOpen(false);
    setNewPassword(null);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogTrigger className="text-xs text-muted-foreground hover:text-foreground transition underline underline-offset-2">
        Reset
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{newPassword ? "Contraseña reseteada" : "Resetear contraseña"}</DialogTitle>
          <DialogDescription>
            {newPassword
              ? `Comparte esta contraseña con ${user.fullName}. Puede cambiarla después.`
              : `Se generará una contraseña temporal nueva para ${user.fullName}. La anterior dejará de funcionar.`}
          </DialogDescription>
        </DialogHeader>

        {newPassword ? (
          <div className="space-y-3">
            <div className="rounded-md border p-3 space-y-2 bg-muted/40">
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-mono text-sm">{user.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contraseña nueva</p>
                <p className="font-mono text-sm select-all">{newPassword}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${user.email}\nContraseña: ${newPassword}`);
                  toast.success("Copiado al portapapeles.");
                }}
              >
                Copiar
              </Button>
              <Button onClick={handleClose}>Listo</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button onClick={handleReset} disabled={isPending}>
              {isPending ? "Generando…" : "Generar contraseña nueva"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete button ────────────────────────────────────────────────────

export function DeleteUserButton({ user, currentUserId }: { user: UserRow; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (user.id === currentUserId) return null;

  function handleDelete() {
    startTransition(async () => {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Error al eliminar.");
        return;
      }
      toast.success("Usuario eliminado.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs text-red-600 hover:text-red-700 transition underline underline-offset-2">
        Eliminar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar usuario</DialogTitle>
          <DialogDescription>
            Esta acción desactivará la cuenta y revocará el acceso de{" "}
            <span className="font-medium text-foreground">{user.fullName}</span>. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={handleDelete}
          >
            {isPending ? "Eliminando…" : "Sí, eliminar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
