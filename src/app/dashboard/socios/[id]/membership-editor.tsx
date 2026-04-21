"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type MembershipData = {
  id: string;
  planName: string;
  priceCents: number;
  customPriceCents: number | null;
  paymentMethod: string | null;
  billingNote: string | null;
  startsAt: string;
  endsAt: string;
  state: string;
  autoRenew: boolean;
};

export function MembershipEditor({
  membership,
  memberId,
}: {
  membership: MembershipData;
  memberId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    customPrice: membership.customPriceCents != null ? (membership.customPriceCents / 100).toString() : "",
    paymentMethod: membership.paymentMethod ?? "",
    billingNote: membership.billingNote ?? "",
    endsAt: membership.endsAt.split("T")[0],
  });

  const displayPrice = membership.customPriceCents != null
    ? membership.customPriceCents / 100
    : membership.priceCents / 100;

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    startTransition(async () => {
      const res = await fetch("/api/membership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: membership.id,
          memberId,
          customPriceCents: form.customPrice ? Math.round(parseFloat(form.customPrice) * 100) : null,
          paymentMethod: form.paymentMethod || null,
          billingNote: form.billingNote || null,
          endsAt: form.endsAt,
        }),
      });
      if (res.ok) {
        toast.success("Membresía actualizada.");
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Precio</span>
          <span className="font-medium">
            ${displayPrice.toFixed(2)}
            {membership.customPriceCents != null && (
              <span className="text-xs text-muted-foreground ml-1">
                (plan: ${(membership.priceCents / 100).toFixed(2)})
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Forma de pago</span>
          <span>{membership.paymentMethod ?? "—"}</span>
        </div>
        {membership.billingNote && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nota</span>
            <span className="text-xs">{membership.billingNote}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Inicio</span>
          <span>{new Date(membership.startsAt).toLocaleDateString("es-EC")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Vencimiento</span>
          <span>{new Date(membership.endsAt).toLocaleDateString("es-EC")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Estado</span>
          <Badge variant="outline">{membership.state}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="mt-2">
          Editar membresía
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Precio especial ($)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder={`Plan: $${(membership.priceCents / 100).toFixed(2)}`}
            value={form.customPrice}
            onChange={(e) => update("customPrice", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Forma de pago</Label>
          <select
            value={form.paymentMethod}
            onChange={(e) => update("paymentMethod", e.target.value)}
            className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-sm"
          >
            <option value="">— Seleccionar —</option>
            <option value="TC">Tarjeta de crédito</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Efectivo">Efectivo</option>
            <option value="TC + Transferencia">TC + Transferencia</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Nota de facturación</Label>
        <Input
          placeholder="ej: 15% desc por transferencia, cobro $50/mes con TC..."
          value={form.billingNote}
          onChange={(e) => update("billingNote", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Fecha de vencimiento</Label>
        <Input type="date" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </div>
  );
}
