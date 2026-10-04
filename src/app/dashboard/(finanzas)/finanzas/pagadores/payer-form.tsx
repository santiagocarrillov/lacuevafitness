"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaxIdType } from "@/generated/prisma/enums";
import { TAX_ID_LABELS, guessTaxIdType, taxIdError } from "@/lib/invoicing/core";
import { savePayer, type PayerInput } from "@/lib/actions/payers";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Payer data as it will appear on the invoice. With `memberId`, it is assigned to that member. */
export function PayerForm({ initial, memberId, memberName, after }: { initial?: PayerInput; memberId?: string; memberName?: string; after: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<PayerInput>(initial ?? { name: "", taxIdType: "CEDULA", taxId: "", email: "", phone: "", address: "", notes: "" });
  const set = <K extends keyof PayerInput>(k: K, v: PayerInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const idError = f.taxId ? taxIdError(f.taxIdType, f.taxId) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const { id } = await savePayer(f, memberId);
        toast.success(initial?.id ? "Pagador actualizado" : memberName ? `Pagador asignado a ${memberName}` : "Pagador creado");
        router.push(after.replace(":id", id));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
        <div className="space-y-1">
          <Label className="text-xs">Identificación</Label>
          <select className={selectCls} value={f.taxIdType} onChange={(e) => set("taxIdType", e.target.value as TaxIdType)}>
            {(Object.keys(TAX_ID_LABELS) as TaxIdType[]).map((t) => (
              <option key={t} value={t}>{TAX_ID_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número</Label>
          <Input
            value={f.taxId}
            aria-invalid={!!idError}
            onChange={(e) => {
              const v = e.target.value.trim();
              set("taxId", v);
              if (/^\d{10}$|^\d{13}$/.test(v)) set("taxIdType", guessTaxIdType(v));
            }}
          />
          {idError && <p className="text-[11px] text-destructive">{idError}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Nombre o razón social (así sale en la factura)</Label>
        <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Correo (recibe la factura)</Label>
          <Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Teléfono</Label>
          <Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Dirección</Label>
        <Input value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notas internas</Label>
        <Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="p. ej. mamá de Saúl y María" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={pending || !!idError || !f.taxId || !f.name.trim()}>
          {pending ? "Guardando…" : initial?.id ? "Guardar cambios" : memberName ? `Crear y asignar a ${memberName}` : "Crear pagador"}
        </Button>
      </div>
    </form>
  );
}
