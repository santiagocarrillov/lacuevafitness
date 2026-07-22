"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { portalSetPassword } from "@/lib/actions/portal-auth";

// Lets any logged-in staff member set their own password from the dashboard
// (the socio portal has the same option under Cuenta → Ajustes). Reuses
// portalSetPassword, which updates whoever is authenticated.
export function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    const res = await portalSetPassword(formData);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Contraseña actualizada.");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition">
        Cambiar contraseña
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>Crea una nueva contraseña para tu cuenta (mín. 8 caracteres).</DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input id="new-password" name="password" type="password" autoComplete="new-password" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Repite la contraseña</Label>
            <Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
