"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { confirmPendingPayment } from "@/lib/actions/payments";

type PoolEntry = {
  id: string;
  paidAt: string | Date | null;
  depositorName: string | null;
  bankReference: string | null;
  bankEntity: string | null;
  amountCents: number;
};

type PendingPayment = {
  id: string;
  amountCents: number;
  method: string;
  member: { firstName: string; lastName: string } | null;
  membership: { plan: { name: string } } | null;
};

const BANKS = [
  "Banco Pichincha",
  "Produbanco",
  "Banco Guayaquil",
  "Banco Internacional",
  "Banco del Pacifico",
  "Banco Bolivariano",
  "Mutualista Pichincha",
  "Cooperativa JEP",
  "Stripe",
  "PayPhone",
  "Otro",
];

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC");
}

/** Dialog to confirm a "fondos sin depositar" payment — optionally link to Isabel's pool. */
export function ConfirmPaymentDialog({
  payment,
  poolEntries,
}: {
  payment: PendingPayment;
  poolEntries: PoolEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"pool" | "manual">("pool");
  const [selectedPoolId, setSelectedPoolId] = useState("");

  // Manual fields
  const [depositorName, setDepositorName] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [bankEntity, setBankEntity] = useState("Banco Pichincha");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);

  function handleConfirm() {
    startTransition(async () => {
      try {
        if (mode === "pool") {
          if (!selectedPoolId) {
            toast.error("Selecciona un pago del banco para vincular.");
            return;
          }
          await confirmPendingPayment(payment.id, { poolEntryId: selectedPoolId });
          toast.success("Pago confirmado y vinculado al registro bancario.");
        } else {
          await confirmPendingPayment(payment.id, {
            depositorName: depositorName || undefined,
            bankReference: bankReference || undefined,
            bankEntity: bankEntity || undefined,
            paidAt,
          });
          toast.success("Pago confirmado manualmente.");
        }
        setOpen(false);
      } catch (err: any) {
        toast.error(err.message ?? "Error al confirmar.");
      }
    });
  }

  // Find close pool entries by amount (±10%)
  const closePools = poolEntries.filter((p) => {
    const diff = Math.abs(p.amountCents - payment.amountCents) / payment.amountCents;
    return diff <= 0.1;
  });
  const otherPools = poolEntries.filter((p) => {
    const diff = Math.abs(p.amountCents - payment.amountCents) / payment.amountCents;
    return diff > 0.1;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-xs text-primary hover:underline font-medium">
        Confirmar
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Confirmar pago</DialogTitle>
          <DialogDescription>
            {payment.member?.firstName} {payment.member?.lastName} · {fmt(payment.amountCents)}
            {payment.membership && (
              <span className="ml-1 text-muted-foreground">· {payment.membership.plan.name}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("pool")}
              className={`flex-1 py-2 rounded-md border text-sm transition ${
                mode === "pool" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
              }`}
            >
              🔗 Vincular a registro bancario
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={`flex-1 py-2 rounded-md border text-sm transition ${
                mode === "manual" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
              }`}
            >
              ✍️ Confirmar manualmente
            </button>
          </div>

          {mode === "pool" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Selecciona el pago bancario de Isabel que corresponde:
              </p>
              {poolEntries.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No hay pagos sin asignar en este momento.<br />
                  Usa "Confirmar manualmente" o pide a Isabel que ingrese los pagos del banco.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto rounded-md border divide-y">
                  {closePools.length > 0 && (
                    <div className="px-3 py-1 bg-emerald-50 text-xs text-emerald-700 font-medium">
                      Monto similar ✓
                    </div>
                  )}
                  {[...closePools, ...otherPools].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPoolId(p.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition hover:bg-accent ${
                        selectedPoolId === p.id ? "bg-primary/10 border-l-2 border-primary" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{p.depositorName ?? "—"}</span>
                        <Badge variant="outline" className={
                          Math.abs(p.amountCents - payment.amountCents) / payment.amountCents <= 0.1
                            ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                            : "text-zinc-600"
                        }>
                          {fmt(p.amountCents)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex gap-3">
                        <span>{fmtDate(p.paidAt)}</span>
                        {p.bankEntity && <span>{p.bankEntity}</span>}
                        {p.bankReference && <span>Ref: {p.bankReference}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Depositante / Nombre en tarjeta</Label>
                <Input
                  value={depositorName}
                  onChange={(e) => setDepositorName(e.target.value)}
                  placeholder="Juan Pérez"
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Referencia / # transacción</Label>
                  <Input
                    value={bankReference}
                    onChange={(e) => setBankReference(e.target.value)}
                    placeholder="TXN-00123"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Entidad bancaria</Label>
                  <select
                    value={bankEntity}
                    onChange={(e) => setBankEntity(e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fecha de pago</Label>
                <Input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Confirmando…" : "Confirmar pago ✓"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
