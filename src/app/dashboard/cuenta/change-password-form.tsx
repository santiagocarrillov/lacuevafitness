"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalSetPassword } from "@/lib/actions/portal-auth";

// Lets any logged-in staff member set their own password from the dashboard
// (/dashboard/cuenta/contrasena; the socio portal has the same option under
// Cuenta → Ajustes). Reuses portalSetPassword, which updates whoever is
// authenticated.
export function ChangePasswordForm({ backHref }: { backHref: string }) {
  const router = useRouter();
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
    router.push(backHref);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">Nueva contraseña</Label>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Repite la contraseña</Label>
        <Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
