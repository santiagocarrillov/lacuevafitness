"use client";

import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPoolEntries, type PoolEntryInput } from "@/lib/actions/payments";

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

const METHODS = [
  { value: "BANK_TRANSFER", label: "Transferencia" },
  { value: "STRIPE_CARD", label: "TC Stripe" },
  { value: "STRIPE_LINK", label: "Stripe Link" },
  { value: "OTHER", label: "Otro" },
] as const;

type Row = {
  paidAt: string;
  depositorName: string;
  bankReference: string;
  bankEntity: string;
  amount: string;       // string for input control, parsed to cents on save
  method: string;
  sede: string;
};

function emptyRow(defaultSede = "FITNESS_CENTER"): Row {
  return {
    paidAt: new Date().toISOString().split("T")[0],
    depositorName: "",
    bankReference: "",
    bankEntity: "Banco Pichincha",
    amount: "",
    method: "BANK_TRANSFER",
    sede: defaultSede,
  };
}

export function PoolEntryForm({
  defaultSede,
  canPickSede,
}: {
  defaultSede: string;
  canPickSede: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow(defaultSede)]);
  const [isPending, startTransition] = useTransition();
  const tableRef = useRef<HTMLTableElement>(null);

  function updateRow(index: number, field: keyof Row, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      emptyRow(last?.sede ?? defaultSede),
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIdx: number,
    colIdx: number,
    totalCols: number
  ) {
    if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey && colIdx === totalCols - 1)) {
      e.preventDefault();
      if (rowIdx === rows.length - 1) {
        addRow();
        // Focus first cell of new row after render
        setTimeout(() => {
          const trs = tableRef.current?.querySelectorAll("tbody tr");
          if (trs) {
            const newRow = trs[trs.length - 1];
            const firstInput = newRow?.querySelector("input, select") as HTMLElement;
            firstInput?.focus();
          }
        }, 50);
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const valid = rows.filter((r) => r.depositorName.trim() && r.amount.trim());
    if (valid.length === 0) {
      toast.error("Agrega al menos un pago con depositante y monto.");
      return;
    }

    const entries: PoolEntryInput[] = valid.map((r) => ({
      paidAt: r.paidAt,
      depositorName: r.depositorName.trim(),
      bankReference: r.bankReference.trim() || undefined,
      bankEntity: r.bankEntity || undefined,
      amountCents: Math.round(parseFloat(r.amount) * 100),
      method: r.method as PoolEntryInput["method"],
      sede: r.sede as PoolEntryInput["sede"],
      notes: undefined,
    }));

    startTransition(async () => {
      try {
        await createPoolEntries(entries);
        toast.success(`${entries.length} pago${entries.length > 1 ? "s" : ""} guardado${entries.length > 1 ? "s" : ""} en Sin asignar.`);
        setRows([emptyRow(defaultSede)]);
      } catch (err: any) {
        toast.error(err.message ?? "Error al guardar.");
      }
    });
  }

  const COLS = 7; // date, depositor, reference, bank, method, amount, sede

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ingresa los pagos del banco/Stripe. Usa <kbd className="text-xs border rounded px-1">Tab</kbd> o <kbd className="text-xs border rounded px-1">Enter</kbd> al final de la fila para agregar una nueva línea.
      </p>

      <div className="overflow-x-auto rounded-md border">
        <table ref={tableRef} className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left font-medium px-2 py-2 w-32">Fecha</th>
              <th className="text-left font-medium px-2 py-2 w-44">Depositante / Nombre TC</th>
              <th className="text-left font-medium px-2 py-2 w-36">Referencia</th>
              <th className="text-left font-medium px-2 py-2 w-40">Entidad bancaria</th>
              <th className="text-left font-medium px-2 py-2 w-32">Método</th>
              <th className="text-left font-medium px-2 py-2 w-28">Monto ($)</th>
              {canPickSede && (
                <th className="text-left font-medium px-2 py-2 w-28">Sede</th>
              )}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-muted/20">
                {/* Fecha */}
                <td className="px-1 py-1">
                  <Input
                    type="date"
                    value={row.paidAt}
                    onChange={(e) => updateRow(ri, "paidAt", e.target.value)}
                    className="h-7 text-xs"
                  />
                </td>

                {/* Depositante */}
                <td className="px-1 py-1">
                  <Input
                    value={row.depositorName}
                    onChange={(e) => updateRow(ri, "depositorName", e.target.value)}
                    placeholder="Juan Pérez"
                    className="h-7 text-xs"
                    onKeyDown={(e) => handleKeyDown(e, ri, 1, COLS)}
                  />
                </td>

                {/* Referencia */}
                <td className="px-1 py-1">
                  <Input
                    value={row.bankReference}
                    onChange={(e) => updateRow(ri, "bankReference", e.target.value)}
                    placeholder="TXN-00123"
                    className="h-7 text-xs"
                    onKeyDown={(e) => handleKeyDown(e, ri, 2, COLS)}
                  />
                </td>

                {/* Banco */}
                <td className="px-1 py-1">
                  <select
                    value={row.bankEntity}
                    onChange={(e) => updateRow(ri, "bankEntity", e.target.value)}
                    className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </td>

                {/* Método */}
                <td className="px-1 py-1">
                  <select
                    value={row.method}
                    onChange={(e) => updateRow(ri, "method", e.target.value)}
                    className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </td>

                {/* Monto */}
                <td className="px-1 py-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateRow(ri, "amount", e.target.value)}
                    placeholder="50.00"
                    className="h-7 text-xs"
                    onKeyDown={(e) => handleKeyDown(e, ri, 5, canPickSede ? COLS - 1 : COLS)}
                  />
                </td>

                {/* Sede (solo si puede escoger) */}
                {canPickSede && (
                  <td className="px-1 py-1">
                    <select
                      value={row.sede}
                      onChange={(e) => updateRow(ri, "sede", e.target.value)}
                      className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                      onKeyDown={(e) => handleKeyDown(e, ri, 6, COLS)}
                    >
                      <option value="FITNESS_CENTER">Fitness Center</option>
                      <option value="XTREME">Xtreme</option>
                    </select>
                  </td>
                )}

                {/* Delete row */}
                <td className="px-1 py-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(ri)}
                    className="text-muted-foreground hover:text-destructive text-xs"
                    aria-label="Eliminar fila"
                    tabIndex={-1}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          + Agregar fila
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : `Guardar ${rows.filter(r => r.depositorName && r.amount).length || ""} pagos`}
        </Button>
        <p className="text-xs text-muted-foreground">
          Los pagos guardados aparecerán en <strong>Sin asignar</strong>.
        </p>
      </div>
    </form>
  );
}
