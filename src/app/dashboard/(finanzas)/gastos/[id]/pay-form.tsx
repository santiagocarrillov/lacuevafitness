"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markExpensePaid } from "@/lib/actions/finance";
import { PAY_METHOD_LABELS } from "@/lib/finance/entities";
import { ecuadorDateString } from "@/lib/timezone";
import type { ExpensePayMethod } from "@/generated/prisma/enums";

/** Inline "mark as paid" for an account payable (replaces the old popup). */
export function PayExpenseForm({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(ecuadorDateString());
  const [method, setMethod] = useState<ExpensePayMethod>("BANK_TRANSFER");
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await markExpensePaid(id, date, method);
            toast.success("Marcado como pagado");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo.");
          }
        });
      }}
    >
      <p className="w-full text-sm font-medium">Esta cuenta está por pagar</p>
      <div className="space-y-1">
        <Label className="text-xs">Fecha de pago</Label>
        <Input type="date" className="h-8" value={date} max={ecuadorDateString()} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Cómo se pagó</Label>
        <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value as ExpensePayMethod)}>
          {(Object.keys(PAY_METHOD_LABELS) as ExpensePayMethod[]).map((m) => (
            <option key={m} value={m}>{PAY_METHOD_LABELS[m]}</option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Guardando…" : "Marcar como pagado"}</Button>
    </form>
  );
}
