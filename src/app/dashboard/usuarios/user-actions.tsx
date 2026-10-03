"use client";

// Confirmations only: editing a user is a full page (/dashboard/usuarios/[id]).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
