"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateOpeningBalance } from "@/lib/actions/finance";
import { fmtMoney } from "@/lib/finance/entities";

/** Click the opening balance to correct it. */
export function OpeningEdit({ id, cents }: { id: string; cents: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (!editing) {
    return (
      <button type="button" className="hover:underline decoration-dotted" title="Corregir saldo inicial" onClick={() => setEditing(true)}>
        {fmtMoney(cents, { decimals: true })}
      </button>
    );
  }
  return (
    <form
      className="inline-flex"
      onSubmit={(e) => {
        e.preventDefault();
        const value = String(new FormData(e.currentTarget).get("amount"));
        start(async () => {
          try {
            await updateOpeningBalance(id, value);
            toast.success("Saldo inicial corregido.");
            setEditing(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
          }
        });
      }}
    >
      <input
        name="amount"
        autoFocus
        defaultValue={(cents / 100).toFixed(2)}
        disabled={pending}
        onBlur={() => !pending && setEditing(false)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        className="h-7 w-28 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums"
      />
    </form>
  );
}
