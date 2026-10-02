"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { ecuadorDateString } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCapitalMovement, createOtherIncome, voidCapitalMovement, voidOtherIncome } from "@/lib/actions/finance";
import { CAPITAL_KIND_LABELS, ENTITIES, ENTITY_ORDER, OTHER_INCOME_LABELS } from "@/lib/finance/entities";
import type { Sede } from "@/generated/prisma/enums";

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EntitySelect({ value, onChange }: { value?: Sede; onChange?: (s: Sede) => void }) {
  return (
    <select
      name="sede"
      className={selectCls}
      defaultValue={value}
      onChange={(e) => onChange?.(e.target.value as Sede)}
      required
    >
      {ENTITY_ORDER.map((s) => (
        <option key={s} value={s}>{ENTITIES[s].name}</option>
      ))}
    </select>
  );
}

/** Shared submit logic: FormData → server action, toast, close. */
function useSubmit(action: (fd: FormData) => Promise<unknown>, onDone: () => void, ok: string) {
  const [pending, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        await action(fd);
        toast.success(ok);
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }
  return { pending, onSubmit };
}

// ── Expense ─────────────────────────────────────────────────────────────────

// ── Owner capital ───────────────────────────────────────────────────────────

export function CapitalForm({ defaultDate, backHref }: { defaultDate?: string; backHref: string }) {
  const router = useRouter();
  const [sede, setSede] = useState<Sede>("XTREME");
  const done = () => router.push(backHref);
  const { pending, onSubmit } = useSubmit(createCapitalMovement, done, "Movimiento registrado.");
  // Persona natural: aporte/retiro. S.A.S.: aporte, préstamo y devolución.
  const kinds =
    sede === "FITNESS_CENTER"
      ? (["CONTRIBUTION", "WITHDRAWAL"] as const)
      : (["SHAREHOLDER_LOAN", "CONTRIBUTION", "LOAN_REPAYMENT"] as const);

  return (
        <form onSubmit={onSubmit} className="space-y-3" key={sede}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entidad"><EntitySelect value={sede} onChange={setSede} /></Field>
            <Field label="Fecha">
              <Input name="date" type="date" defaultValue={defaultDate ?? ecuadorDateString()} required />
            </Field>
          </div>
          <Field
            label="Tipo"
            hint={sede === "XTREME"
              ? "En la S.A.S., registra como préstamo del accionista lo que se espera recuperar; como aporte, lo que irá a capital."
              : undefined}
          >
            <select name="kind" className={selectCls} required>
              {kinds.map((k) => (
                <option key={k} value={k}>{CAPITAL_KIND_LABELS[k]}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Persona">
              <select name="person" className={selectCls} required>
                {ENTITIES[sede].owners.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Monto (USD)">
              <Input name="amount" inputMode="decimal" placeholder="0.00" required />
            </Field>
          </div>
          <Field label="Notas"><Input name="notes" placeholder="Para qué se usó: nómina de octubre, arriendo…" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={done}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
  );
}

// ── Other income ────────────────────────────────────────────────────────────

export function OtherIncomeForm({ defaultDate, backHref }: { defaultDate?: string; backHref: string }) {
  const router = useRouter();
  const done = () => router.push(backHref);
  const { pending, onSubmit } = useSubmit(createOtherIncome, done, "Ingreso registrado.");
  return (
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entidad"><EntitySelect /></Field>
            <Field label="Fecha">
              <Input name="date" type="date" defaultValue={defaultDate ?? ecuadorDateString()} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <select name="category" className={selectCls} required>
                {Object.entries(OTHER_INCOME_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Monto (USD)">
              <Input name="amount" inputMode="decimal" placeholder="0.00" required />
            </Field>
          </div>
          <Field label="Descripción"><Input name="description" placeholder="4 Gatorade" required /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={done}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
  );
}

export function VoidButton({ id, kind }: { id: string; kind: "capital" | "other" }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-red-700 hover:underline"
      onClick={() => {
        if (!window.confirm("¿Anular este registro? Queda en el historial como anulado.")) return;
        start(async () => {
          try {
            await (kind === "capital" ? voidCapitalMovement(id) : voidOtherIncome(id));
            toast.success("Anulado.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo anular.");
          }
        });
      }}
    >
      Anular
    </button>
  );
}
