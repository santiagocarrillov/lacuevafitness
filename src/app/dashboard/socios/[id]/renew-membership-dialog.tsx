"use client";

import { useMemo, useState, useTransition } from "react";
import { ecuadorDateString } from "@/lib/timezone";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { renewMembership } from "@/lib/actions/members";

type Plan = { id: string; name: string; priceCents: number; durationDays: number };

type CurrentMembership = {
  id: string;
  planId: string;
  planName: string;
  priceCents: number;
  customPriceCents: number | null;
  endsAt: Date | string;
};

function fmt$(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format an ISO/Date to a yyyy-mm-dd value for <input type="date">. */
function toDateInput(d: Date | string): string {
  return ecuadorDateString(new Date(d));
}

export function RenewMembershipDialog({
  memberId,
  membership,
  plans,
}: {
  memberId: string;
  membership: CurrentMembership;
  plans: Plan[]; // already filtered by the member's sede
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Chain without gaps: new month starts when the current one ends, unless the
  // socio already lapsed — then start today.
  const chainStart = useMemo(() => {
    const today = ecuadorDateString();
    const end = toDateInput(membership.endsAt);
    return end > today ? end : today;
  }, [membership.endsAt]);

  const prevPrice = membership.customPriceCents ?? membership.priceCents;

  const [planId, setPlanId] = useState(membership.planId);
  const [price, setPrice] = useState((prevPrice / 100).toFixed(2));
  const [startsAt, setStartsAt] = useState(chainStart);
  const [registerPay, setRegisterPay] = useState(true);
  const [amount, setAmount] = useState((prevPrice / 100).toFixed(2));
  const [method, setMethod] = useState("CASH");
  const [paidAt, setPaidAt] = useState(ecuadorDateString());
  const [depositorName, setDepositorName] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [bankEntity, setBankEntity] = useState("");
  const [notes, setNotes] = useState("");

  // When the plan changes, refresh price + amount to the new plan's price
  // (unless a plan isn't in the list, e.g. the current one from another sede).
  function changePlan(id: string) {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (p) {
      const v = (p.priceCents / 100).toFixed(2);
      setPrice(v);
      setAmount(v);
    }
  }

  const selectedPlan = plans.find((p) => p.id === planId);
  const endsPreview = useMemo(() => {
    const days = selectedPlan?.durationDays;
    if (!days || !startsAt) return null;
    const d = new Date(`${startsAt}T00:00:00`);
    d.setDate(d.getDate() + days);
    return ecuadorDateString(d);
  }, [selectedPlan?.durationDays, startsAt]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const priceCents = Math.round(parseFloat(price) * 100);
        if (isNaN(priceCents) || priceCents <= 0) {
          toast.error("Precio inválido.");
          return;
        }
        let payment: Parameters<typeof renewMembership>[0]["payment"];
        if (registerPay) {
          const cents = Math.round(parseFloat(amount) * 100);
          if (isNaN(cents) || cents <= 0) {
            toast.error("Monto del pago inválido.");
            return;
          }
          payment = {
            amountCents: cents,
            method: method as never,
            paidAt,
            depositorName: depositorName || undefined,
            bankReference: bankReference || undefined,
            bankEntity: bankEntity || undefined,
            notes: notes || undefined,
          };
        }
        // Only send customPriceCents when it differs from the selected plan price,
        // so a plain renewal stays on the plan's list price.
        const planPrice = selectedPlan?.priceCents ?? membership.priceCents;
        const customPriceCents = priceCents !== planPrice ? priceCents : null;

        await renewMembership({
          memberId,
          fromMembershipId: membership.id,
          planId,
          customPriceCents,
          startsAt,
          payment,
        });
        toast.success(
          registerPay
            ? method === "CASH"
              ? "Membresía renovada y pago registrado."
              : "Membresía renovada. Pago en 'fondos sin depositar' hasta verificar."
            : "Membresía renovada.",
        );
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al renovar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background text-sm font-medium h-8 px-3 hover:bg-accent transition">
        ↻ Renovar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renovar membresía</DialogTitle>
          <DialogDescription>
            Crea la siguiente mensualidad de {membership.planName}. Vence actual: {toDateInput(membership.endsAt)}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          {plans.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Plan</Label>
              <select value={planId} onChange={(e) => changePlan(e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                {!plans.some((p) => p.id === planId) && (
                  <option value={planId}>{membership.planName} (actual)</option>
                )}
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {fmt$(p.priceCents)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Precio del mes ($)</Label>
              <Input type="number" step="0.01" min="0" value={price}
                onChange={(e) => setPrice(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Inicia</Label>
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
          </div>
          {endsPreview && (
            <p className="text-[11px] text-muted-foreground -mt-1">
              Nueva mensualidad: {startsAt} → {endsPreview}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm pt-1 cursor-pointer">
            <input type="checkbox" checked={registerPay}
              onChange={(e) => setRegisterPay(e.target.checked)} />
            Registrar el pago del mes ahora
          </label>

          {registerPay && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Monto ($)</Label>
                  <Input type="number" step="0.01" min="0" value={amount}
                    onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Método</Label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="CASH">Efectivo (se confirma al instante)</option>
                    <option value="BANK_TRANSFER">Transferencia (queda pendiente hasta verificar)</option>
                    <option value="STRIPE_CARD">Tarjeta</option>
                    <option value="PLUX_CARD">TC Plux</option>
                    <option value="STRIPE_LINK">Link Stripe</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </div>
              </div>
              {method !== "CASH" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Depositante / titular</Label>
                    <Input value={depositorName} onChange={(e) => setDepositorName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Referencia bancaria</Label>
                      <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Banco</Label>
                      <Input value={bankEntity} onChange={(e) => setBankEntity(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Notas</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Renovar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
