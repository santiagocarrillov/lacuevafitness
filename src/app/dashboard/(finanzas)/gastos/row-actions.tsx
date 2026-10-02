"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { reviewExpense, voidExpenseScoped } from "@/lib/actions/expenses";

export function ExpenseRowActions({ id, canReview, canVoid }: { id: string; canReview: boolean; canVoid: boolean }) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo.");
      }
    });
  return (
    <div className="flex items-center justify-end gap-3 text-xs">
      {canReview && (
        <button type="button" disabled={pending} className="text-primary hover:underline" onClick={() => run(() => reviewExpense(id), "Revisado")}>
          revisado
        </button>
      )}
      {canVoid && (
        <button
          type="button"
          disabled={pending}
          className="text-muted-foreground hover:text-destructive hover:underline"
          onClick={() => {
            const reason = window.prompt("¿Por qué se anula este gasto?");
            if (reason?.trim()) run(() => voidExpenseScoped(id, reason), "Gasto anulado");
          }}
        >
          anular
        </button>
      )}
    </div>
  );
}
