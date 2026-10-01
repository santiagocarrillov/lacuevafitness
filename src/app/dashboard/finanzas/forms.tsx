"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { ecuadorDateString } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { compressImage } from "@/components/nutrition/photo-upload";
import {
  createCapitalMovement,
  createExpense,
  createOtherIncome,
  getExpenseReceiptUrl,
  markExpensePaid,
  voidCapitalMovement,
  voidExpense,
  voidOtherIncome,
} from "@/lib/actions/finance";
import {
  CAPITAL_KIND_LABELS,
  DOC_TYPE_LABELS,
  ENTITIES,
  ENTITY_ORDER,
  EXPENSE_CATEGORY_LABELS,
  OTHER_INCOME_LABELS,
  PAY_METHOD_LABELS,
} from "@/lib/finance/entities";
import type { ExpensePayMethod, Sede } from "@/generated/prisma/enums";

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

export function ExpenseDialog({ defaultDate }: { defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const [paid, setPaid] = useState(true);
  const [docType, setDocType] = useState("SIN_DOCUMENTO");

  async function submit(fd: FormData) {
    const file = fd.get("receipt");
    if (file instanceof File && file.size > 0 && file.type.startsWith("image/")) {
      // Invoices need to stay legible: allow a larger side than recipe photos.
      fd.set("receipt", await compressImage(file, 2000));
    }
    await createExpense(fd);
  }
  const { pending, onSubmit } = useSubmit(submit, () => setOpen(false), "Gasto registrado.");
  const hasDoc = docType !== "SIN_DOCUMENTO";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex">
        <Button size="sm">+ Registrar gasto</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar gasto</DialogTitle>
          <DialogDescription>
            Para lo que no llega por el banco ni por el SRI: efectivo, caja chica, pagos menores.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Entidad"><EntitySelect /></Field>
            <Field label="Fecha">
              <Input name="date" type="date" defaultValue={defaultDate ?? ecuadorDateString()} required />
            </Field>
          </div>
          <Field label="Descripción">
            <Input name="description" placeholder="Cuidador de parqueadero, café para la recepción…" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <select name="category" className={selectCls} defaultValue="OTHER" required>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Total (USD)">
              <Input name="amount" inputMode="decimal" placeholder="0.00" required />
            </Field>
          </div>

          <Field label="Documento">
            <select
              name="documentType"
              className={selectCls}
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          {hasDoc && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Proveedor"><Input name="supplierName" /></Field>
              <Field label="RUC / cédula"><Input name="supplierRuc" inputMode="numeric" maxLength={13} /></Field>
              <Field label="N.º de documento"><Input name="documentNumber" placeholder="001-001-000000123" /></Field>
              <Field label="IVA (USD)" hint="Vacío si no aplica"><Input name="iva" inputMode="decimal" /></Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <select
                name="status"
                className={selectCls}
                value={paid ? "PAID" : "PENDING"}
                onChange={(e) => setPaid(e.target.value === "PAID")}
              >
                <option value="PAID">Pagado</option>
                <option value="PENDING">Por pagar</option>
              </select>
            </Field>
            {paid ? (
              <Field label="Forma de pago">
                <select name="paymentMethod" className={selectCls} defaultValue="CASH">
                  {Object.entries(PAY_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Vence"><Input name="dueDate" type="date" /></Field>
            )}
          </div>

          <Field label="Comprobante (foto o PDF)" hint="Opcional. Las fotos se reducen antes de subir.">
            <Input name="receipt" type="file" accept="image/*,application/pdf" capture="environment" />
          </Field>
          <Field label="Notas"><Input name="notes" /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="recurring" /> Gasto fijo mensual
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseActions({
  id,
  hasReceipt,
  pendingPayment,
}: {
  id: string;
  hasReceipt: boolean;
  pendingPayment: boolean;
}) {
  const [pending, start] = useTransition();

  function openReceipt() {
    start(async () => {
      const url = await getExpenseReceiptUrl(id);
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("No se encontró el comprobante.");
    });
  }

  function cancel() {
    const reason = window.prompt("Motivo de la anulación:");
    if (!reason) return;
    start(async () => {
      try {
        await voidExpense(id, reason);
        toast.success("Gasto anulado.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo anular.");
      }
    });
  }

  return (
    <div className="flex justify-end gap-2 text-xs">
      {hasReceipt && (
        <button type="button" onClick={openReceipt} disabled={pending} className="text-primary hover:underline">
          Comprobante
        </button>
      )}
      {pendingPayment && <PayDialog id={id} />}
      <button type="button" onClick={cancel} disabled={pending} className="text-red-700 hover:underline">
        Anular
      </button>
    </div>
  );
}

function PayDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        await markExpensePaid(id, String(fd.get("paidAt")), fd.get("method") as ExpensePayMethod);
        toast.success("Marcado como pagado.");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo actualizar.");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="text-primary hover:underline">Pagar</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Marcar como pagado</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="Fecha de pago">
            <Input name="paidAt" type="date" defaultValue={ecuadorDateString()} required />
          </Field>
          <Field label="Forma de pago">
            <select name="method" className={selectCls} defaultValue="BANK_TRANSFER">
              {Object.entries(PAY_METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>Guardar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Owner capital ───────────────────────────────────────────────────────────

export function CapitalDialog({ defaultDate }: { defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const [sede, setSede] = useState<Sede>("XTREME");
  const { pending, onSubmit } = useSubmit(createCapitalMovement, () => setOpen(false), "Movimiento registrado.");
  // Persona natural: aporte/retiro. S.A.S.: aporte, préstamo y devolución.
  const kinds =
    sede === "FITNESS_CENTER"
      ? (["CONTRIBUTION", "WITHDRAWAL"] as const)
      : (["SHAREHOLDER_LOAN", "CONTRIBUTION", "LOAN_REPAYMENT"] as const);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex">
        <Button size="sm">+ Registrar movimiento</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aporte o préstamo de los dueños</DialogTitle>
          <DialogDescription>
            Dinero que tú o Isabel ponen para cubrir la caja (o que regresa a ustedes). No cuenta como ingreso.
          </DialogDescription>
        </DialogHeader>
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
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Other income ────────────────────────────────────────────────────────────

export function OtherIncomeDialog({ defaultDate }: { defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const { pending, onSubmit } = useSubmit(createOtherIncome, () => setOpen(false), "Ingreso registrado.");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex">
        <Button size="sm">+ Registrar ingreso</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Otro ingreso</DialogTitle>
          <DialogDescription>Ventas de Gatorade y productos, reembolsos y otros ingresos que no son membresías.</DialogDescription>
        </DialogHeader>
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
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
