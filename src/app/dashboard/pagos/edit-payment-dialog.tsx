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
import { updatePayment } from "@/lib/actions/payments";

type Payment = {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  paidAt: Date | string | null;
  depositorName: string | null;
  bankReference: string | null;
  bankEntity: string | null;
  notes: string | null;
};

const METHODS: Array<{ value: string; label: string }> = [
  { value: "CASH", label: "Efectivo" },
  { value: "BANK_TRANSFER", label: "Transferencia" },
  { value: "STRIPE_CARD", label: "TC Stripe" },
  { value: "STRIPE_LINK", label: "Stripe Link" },
  { value: "OTHER", label: "Otro" },
];

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "SUCCEEDED", label: "Confirmado" },
  { value: "PENDING", label: "Fondos sin depositar" },
  { value: "FAILED", label: "Fallido" },
  { value: "REFUNDED", label: "Reembolsado" },
];

function isoDate(d: Date | string | null): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function EditPaymentDialog({ payment }: { payment: Payment }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState({
    amount: (payment.amountCents / 100).toFixed(2),
    method: payment.method,
    status: payment.status,
    paidAt: isoDate(payment.paidAt),
    depositorName: payment.depositorName ?? "",
    bankReference: payment.bankReference ?? "",
    bankEntity: payment.bankEntity ?? "",
    notes: payment.notes ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const cents = Math.round(parseFloat(f.amount) * 100);
        if (isNaN(cents) || cents < 0) {
          toast.error("Monto inválido.");
          return;
        }
        await updatePayment(payment.id, {
          amountCents: cents,
          method: f.method as never,
          status: f.status as never,
          paidAt: f.paidAt || null,
          depositorName: f.depositorName.trim() || null,
          bankReference: f.bankReference.trim() || null,
          bankEntity: f.bankEntity.trim() || null,
          notes: f.notes.trim() || null,
        });
        toast.success("Pago actualizado.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs text-muted-foreground hover:text-foreground transition">
        editar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar pago</DialogTitle>
          <DialogDescription>
            Corrige los datos de un pago ya registrado. Los cambios afectan a la membresía vinculada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Monto ($)</Label>
              <Input type="number" step="0.01" min="0" value={f.amount}
                onChange={(e) => set("amount", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={f.paidAt} onChange={(e) => set("paidAt", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Método</Label>
              <select value={f.method} onChange={(e) => set("method", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <select value={f.status} onChange={(e) => set("status", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Depositante / titular</Label>
            <Input value={f.depositorName} onChange={(e) => set("depositorName", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Referencia bancaria</Label>
              <Input value={f.bankReference} onChange={(e) => set("bankReference", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Banco</Label>
              <Input value={f.bankEntity} onChange={(e) => set("bankEntity", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas</Label>
            <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
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
