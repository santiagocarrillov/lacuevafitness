"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TaxIdType } from "@/generated/prisma/enums";
import { TAX_ID_LABELS, guessTaxIdType, taxIdError } from "@/lib/invoicing/core";
import { saveSupplier, type SupplierInput } from "@/lib/actions/suppliers";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SupplierForm({ initial, accounts }: { initial?: SupplierInput; accounts: { code: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<SupplierInput>(initial ?? { name: "", taxIdType: "RUC", taxId: "" });
  const [terms, setTerms] = useState(initial?.paymentTermsDays != null ? String(initial.paymentTermsDays) : "");
  const set = <K extends keyof SupplierInput>(k: K, v: SupplierInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const idError = f.taxId && f.taxIdType ? taxIdError(f.taxIdType, f.taxId) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const { id } = await saveSupplier({ ...f, paymentTermsDays: terms.trim() ? Number(terms) : null });
        toast.success(initial?.id ? "Proveedor actualizado" : "Proveedor creado");
        router.push(`/dashboard/finanzas/proveedores/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
        <Field label="Identificación">
          <select className={selectCls} value={f.taxIdType ?? "RUC"} onChange={(e) => set("taxIdType", e.target.value as TaxIdType)}>
            {(Object.keys(TAX_ID_LABELS) as TaxIdType[]).map((t) => (
              <option key={t} value={t}>{TAX_ID_LABELS[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Número (opcional para tiendas sin RUC)">
          <Input
            value={f.taxId ?? ""}
            inputMode="numeric"
            aria-invalid={!!idError}
            onChange={(e) => {
              const v = e.target.value.trim();
              set("taxId", v);
              if (/^\d{10}$|^\d{13}$/.test(v)) set("taxIdType", guessTaxIdType(v));
            }}
          />
          {idError && <p className="text-[11px] text-destructive">{idError}</p>}
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Razón social">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Nombre comercial">
          <Input value={f.tradeName ?? ""} onChange={(e) => set("tradeName", e.target.value)} placeholder="p. ej. Kywi" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Contacto">
          <Input value={f.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Correo">
          <Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </div>
      <Field label="Dirección">
        <Input value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Field label="Cuenta de gasto habitual" hint="Se propone al registrar un gasto de este proveedor.">
          <select className={selectCls} value={f.defaultAccountCode ?? ""} onChange={(e) => set("defaultAccountCode", e.target.value)}>
            <option value="">— Ninguna —</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Plazo de pago (días)" hint="Vencimiento = fecha + días.">
          <Input inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value.replace(/\D/g, ""))} placeholder="p. ej. 30" />
        </Field>
      </div>
      <Field label="Notas internas">
        <Input value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" disabled={pending || !!idError || !f.name.trim()}>
          {pending ? "Guardando…" : initial?.id ? "Guardar cambios" : "Crear proveedor"}
        </Button>
      </div>
    </form>
  );
}
