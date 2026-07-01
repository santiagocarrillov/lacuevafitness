"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ecuadorDateString } from "@/lib/timezone";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  registerMemberPayment, findMatchingPoolEntries, assignPoolEntryToMembership,
} from "@/lib/actions/payments";

type Match = {
  id: string;
  amountCents: number;
  method: string;
  paidAt: Date | string | null;
  depositorName: string | null;
  bankReference: string | null;
  bankEntity: string | null;
  matchedTokens: string[];
};

type Payment = {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  paidAt: Date | string | null;
  membershipId: string | null;
};

type Membership = {
  id: string;
  priceCents: number;
  customPriceCents: number | null;
  startsAt: Date | string;
  endsAt: Date | string;
  state: string;
  planName: string;
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  STRIPE_CARD: "Tarjeta",
  STRIPE_LINK: "Link Stripe",
  OTHER: "Otro",
};

function fmt$(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC");
}

function daysSince(d: Date | string): number {
  const start = new Date(d).getTime();
  return Math.floor((Date.now() - start) / 86400000);
}

export function MembershipPaymentPanel({
  memberId,
  membership,
  payments,
  sede,
  canEdit,
}: {
  memberId: string;
  membership: Membership;
  payments: Payment[];        // all payments for this member
  sede: "FITNESS_CENTER" | "XTREME";
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);

  // Load matching pool entries when dialog opens
  useEffect(() => {
    if (!open || matchesLoaded) return;
    findMatchingPoolEntries(memberId)
      .then((m) => { setMatches(m as Match[]); setMatchesLoaded(true); })
      .catch(() => setMatchesLoaded(true));
  }, [open, matchesLoaded, memberId]);

  function handleAssignPool(poolId: string) {
    startTransition(async () => {
      try {
        await assignPoolEntryToMembership(poolId, memberId, membership.id);
        toast.success("Pago bancario asignado a la membresía.");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al asignar.");
      }
    });
  }

  // Payments tied to this membership
  const linked = useMemo(
    () => payments.filter((p) => p.membershipId === membership.id),
    [payments, membership.id],
  );
  const succeededTotal = linked.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amountCents, 0);
  const pendingTotal = linked.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amountCents, 0);
  const expectedCents = membership.customPriceCents ?? membership.priceCents;
  const remaining = expectedCents - succeededTotal;
  const daysOld = daysSince(membership.startsAt);
  const fullyPaid = succeededTotal >= expectedCents;
  const partial = !fullyPaid && succeededTotal > 0;
  const overdue = !fullyPaid && daysOld > 7 && succeededTotal === 0 && pendingTotal === 0;

  // ── Status badge ─────────────────────────────────────────────────
  let badge: { label: string; cls: string };
  if (fullyPaid) {
    badge = { label: "✓ Pagado", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  } else if (overdue) {
    badge = { label: `🚨 Sin pago (${daysOld}d)`, cls: "bg-red-50 text-red-800 border-red-200" };
  } else if (pendingTotal > 0) {
    badge = { label: "⏳ Pendiente (fondos sin verificar)", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  } else if (partial) {
    badge = { label: "💰 Pago parcial", cls: "bg-blue-50 text-blue-800 border-blue-200" };
  } else {
    badge = { label: `🕓 Sin pago aún (${daysOld}d)`, cls: "bg-zinc-50 text-zinc-700 border-zinc-200" };
  }

  // ── Form ─────────────────────────────────────────────────────────
  const [f, setF] = useState({
    amount: ((remaining > 0 ? remaining : expectedCents) / 100).toFixed(2),
    method: "CASH",
    paidAt: ecuadorDateString(),
    depositorName: "",
    bankReference: "",
    bankEntity: "",
    notes: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const cents = Math.round(parseFloat(f.amount) * 100);
        if (isNaN(cents) || cents <= 0) {
          toast.error("Monto inválido.");
          return;
        }
        await registerMemberPayment({
          memberId,
          membershipId: membership.id,
          amountCents: cents,
          method: f.method as never,
          paidAt: f.paidAt,
          depositorName: f.depositorName || undefined,
          bankReference: f.bankReference || undefined,
          bankEntity: f.bankEntity || undefined,
          sede,
          notes: f.notes || undefined,
        });
        toast.success(
          f.method === "CASH"
            ? "Pago registrado (confirmado al instante)."
            : "Pago registrado en 'fondos sin depositar'. Isabel debe verificar.",
        );
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar.");
      }
    });
  }

  return (
    <div className="space-y-2 border-t pt-3 mt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Pago de esta membresía</p>
          <Badge variant="outline" className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
        </div>
        {canEdit && !fullyPaid && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium h-8 px-3 hover:opacity-90 transition">
              + Registrar pago
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar pago de la membresía</DialogTitle>
                <DialogDescription>
                  {membership.planName} · Precio: {fmt$(expectedCents)}
                  {succeededTotal > 0 && ` · Pagado: ${fmt$(succeededTotal)} · Falta: ${fmt$(remaining)}`}
                </DialogDescription>
              </DialogHeader>

              {/* Bank pool matches (Isabel's deposits with similar depositor name) */}
              {matches.length > 0 && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-900">
                    💡 Posibles coincidencias del banco
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Pagos que Isabel ya cargó del banco y parecen ser de este socio. Asigna uno con un click y queda conciliado al instante.
                  </p>
                  <div className="space-y-1">
                    {matches.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5">
                        <div className="text-xs space-y-0.5 flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {fmt$(m.amountCents)} · {m.depositorName}
                          </p>
                          <p className="text-muted-foreground">
                            {fmtDate(m.paidAt)}
                            {m.bankEntity && ` · ${m.bankEntity}`}
                            {m.bankReference && ` · Ref ${m.bankReference}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => handleAssignPool(m.id)}
                          className="shrink-0"
                        >
                          Asignar
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">
                    O ingresa un pago manual abajo si ninguno coincide.
                  </p>
                </div>
              )}

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
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Método</Label>
                    <select value={f.method} onChange={(e) => set("method", e.target.value)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                      <option value="CASH">Efectivo (se confirma al instante)</option>
                      <option value="BANK_TRANSFER">Transferencia (queda pendiente hasta verificar)</option>
                      <option value="STRIPE_CARD">Tarjeta</option>
                      <option value="STRIPE_LINK">Link Stripe</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </div>
                </div>
                {f.method !== "CASH" && (
                  <>
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
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Guardando…" : "Registrar pago"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Linked payments list */}
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin pagos registrados para esta membresía.</p>
      ) : (
        <div className="rounded-md border divide-y text-xs">
          {linked.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${
                  p.status === "SUCCEEDED" ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                  : p.status === "PENDING" ? "text-amber-700 border-amber-200 bg-amber-50"
                  : "text-zinc-600 border-zinc-200"
                }`}>
                  {p.status === "SUCCEEDED" ? "✓" : p.status === "PENDING" ? "⏳" : p.status}
                </Badge>
                <span className="font-medium">{fmt$(p.amountCents)}</span>
                <span className="text-muted-foreground">· {METHOD_LABELS[p.method] ?? p.method}</span>
              </div>
              <span className="text-muted-foreground">{fmtDate(p.paidAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Totals row */}
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">
          Pagado <strong className="text-emerald-700">{fmt$(succeededTotal)}</strong>
          {pendingTotal > 0 && <> · Pendiente <strong className="text-amber-700">{fmt$(pendingTotal)}</strong></>}
        </span>
        {!fullyPaid && (
          <span className="text-muted-foreground">Falta <strong>{fmt$(remaining)}</strong></span>
        )}
      </div>
    </div>
  );
}
