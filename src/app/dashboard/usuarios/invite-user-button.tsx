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

export function InviteUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({
    email: "",
    fullName: "",
    role: "ADMIN",
    sede: "",
  });

  function update(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
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
        const err = await res.json();
        toast.error(err.error ?? "Error al crear usuario.");
        return;
      }
      const data = await res.json();
      setCreated({ email: form.email, password: data.password });
      toast.success("Usuario creado.");
      router.refresh();
    });
  }

  function handleClose() {
    setOpen(false);
    setCreated(null);
    setForm({ email: "", fullName: "", role: "ADMIN", sede: "" });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-7 px-2.5">
        + Invitar usuario
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Usuario creado" : "Invitar usuario"}</DialogTitle>
          <DialogDescription>
            {created
              ? "Comparte estos datos con la persona. Puede cambiar la contraseña después."
              : "Se creará una cuenta con contraseña temporal."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
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
              <Button onClick={() => {
                navigator.clipboard.writeText(`Email: ${created.email}\nContraseña: ${created.password}`);
                toast.success("Copiado al portapapeles.");
              }} variant="outline">
                Copiar
              </Button>
              <Button onClick={handleClose}>Listo</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Nombre completo *</Label>
              <Input required value={form.fullName} onChange={(e) => update("fullName", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Rol</Label>
                <select value={form.role} onChange={(e) => update("role", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
                  <option value="OWNER">Fundador</option>
                  <option value="ACCOUNTING">Contabilidad</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="COACH">Coach</option>
                  <option value="NUTRITIONIST">Nutricionista</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Sede</Label>
                <select value={form.sede} onChange={(e) => update("sede", e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm">
                  <option value="">Ambas (OWNER/ACCOUNTING)</option>
                  <option value="FITNESS_CENTER">Fitness Center</option>
                  <option value="XTREME">Xtreme</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creando…" : "Crear usuario"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
