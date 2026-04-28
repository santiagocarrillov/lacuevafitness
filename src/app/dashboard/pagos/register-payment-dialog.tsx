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
import { registerMemberPayment } from "@/lib/actions/payments";

type Member = { id: string; firstName: string; lastName: string };
type Membership = { id: string; plan: { name: string }; endsAt: string };

const METHOD_OPTIONS = [
  { value: "CASH", label: "Efectivo", badge: "💵" },
  { value: "BANK_TRANSFER", label: "Transferencia bancaria", badge: "🏦" },
  { value: "STRIPE_CARD", label: "Tarjeta de crédito / débito", badge: "💳" },
  { value: "STRIPE_LINK", label: "Stripe Link", badge: "🔗" },
  { value: "OTHER", label: "Otro", badge: "📋" },
] as const;

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

export function RegisterPaymentDialog({
  members,
  defaultSede,
  canPickSede,
  trigger,
}: {
  members: Member[];
  defaultSede: string;
  canPickSede: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [memberId, setMemberId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [membershipId, setMembershipId] = useState("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);

  const [method, setMethod] = useState<string>("CASH");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split("T")[0]);
  const [depositorName, setDepositorName] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [bankEntity, setBankEntity] = useState("Banco Pichincha");
  const [sede, setSede] = useState(defaultSede);
  const [notes, setNotes] = useState("");

  const isCash = method === "CASH";

  // Filtered member list
  const filtered = memberSearch.trim()
    ? members.filter((m) =>
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  async function pickMember(m: Member) {
    setMemberId(m.id);
    setMemberSearch(`${m.firstName} ${m.lastName}`);
    setMemberships([]);
    setMembershipId("");
    // Load memberships for this member via fetch (quick inline load)
    setLoadingMemberships(true);
    try {
      const res = await fetch(`/api/members/${m.id}/memberships`);
      if (res.ok) {
        const data = await res.json();
        setMemberships(data);
      }
    } catch {
      // ignore — membership link is optional
    } finally {
      setLoadingMemberships(false);
    }
  }

  function reset() {
    setMemberId("");
    setMemberSearch("");
    setMembershipId("");
    setMemberships([]);
    setMethod("CASH");
    setAmount("");
    setPaidAt(new Date().toISOString().split("T")[0]);
    setDepositorName("");
    setBankReference("");
    setBankEntity("Banco Pichincha");
    setSede(defaultSede);
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!memberId) {
      toast.error("Selecciona un socio.");
      return;
    }
    const amountNum = parseFloat(amount);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      toast.error("Ingresa un monto válido.");
      return;
    }

    startTransition(async () => {
      try {
        await registerMemberPayment({
          memberId,
          membershipId: membershipId || undefined,
          amountCents: Math.round(amountNum * 100),
          method: method as any,
          paidAt,
          depositorName: depositorName || undefined,
          bankReference: bankReference || undefined,
          bankEntity: bankEntity || undefined,
          sede: sede as any,
          notes: notes || undefined,
        });

        const label = isCash ? "Pago en efectivo registrado." : "Fondos sin depositar registrados.";
        toast.success(label);
        setOpen(false);
        reset();
      } catch (err: any) {
        toast.error(err.message ?? "Error al registrar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger className="inline-flex">
        {trigger ?? (
          <Button size="sm">+ Registrar pago</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            Efectivo → queda confirmado. Transferencia/TC → aparece como <strong>fondos sin depositar</strong> hasta confirmar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Member search */}
          <div className="space-y-1 relative">
            <Label className="text-xs">Socio *</Label>
            <Input
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                if (memberId) setMemberId(""); // clear selection on type
              }}
              placeholder="Buscar por nombre..."
              className="h-8 text-sm"
              autoComplete="off"
            />
            {filtered.length > 0 && !memberId && (
              <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-background shadow-md">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pickMember(m)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                  >
                    {m.firstName} {m.lastName}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Membership link (optional) */}
          {memberId && (
            <div className="space-y-1">
              <Label className="text-xs">Membresía (opcional)</Label>
              {loadingMemberships ? (
                <p className="text-xs text-muted-foreground">Cargando membresías…</p>
              ) : memberships.length > 0 ? (
                <select
                  value={membershipId}
                  onChange={(e) => setMembershipId(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— Sin vincular a membresía —</option>
                  {memberships.map((ms) => (
                    <option key={ms.id} value={ms.id}>
                      {ms.plan.name} · vence {new Date(ms.endsAt).toLocaleDateString("es-EC")}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-muted-foreground">Sin membresías activas.</p>
              )}
            </div>
          )}

          {/* Method */}
          <div className="space-y-1">
            <Label className="text-xs">Método de pago *</Label>
            <div className="flex flex-wrap gap-2">
              {METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMethod(opt.value)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs transition ${
                    method === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <span>{opt.badge}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            {!isCash && (
              <p className="text-xs text-amber-600">
                ⚠ Quedará como <strong>fondos sin depositar</strong> hasta que confirmes con el banco.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Amount */}
            <div className="space-y-1">
              <Label className="text-xs">Monto ($) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50.00"
                className="h-8 text-sm"
              />
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label className="text-xs">Fecha</Label>
              <Input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Bank details — always shown for non-cash */}
          {!isCash && (
            <>
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
            </>
          )}

          {/* Sede */}
          {canPickSede && (
            <div className="space-y-1">
              <Label className="text-xs">Sede</Label>
              <select
                value={sede}
                onChange={(e) => setSede(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="FITNESS_CENTER">Fitness Center</option>
                <option value="XTREME">Xtreme</option>
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: renovación mayo, descuento..."
              className="h-8 text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => { setOpen(false); reset(); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : isCash ? "Registrar efectivo" : "Registrar fondos sin depositar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
