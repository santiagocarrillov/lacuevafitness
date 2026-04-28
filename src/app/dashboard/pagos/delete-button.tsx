"use client";

import { useTransition } from "react";
import { toast } from "sonner";

export function DeleteButton({
  action,
  label = "eliminar",
}: {
  action: () => Promise<void>;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("¿Eliminar este registro?")) return;
    startTransition(async () => {
      try {
        await action();
      } catch (err: any) {
        toast.error(err.message ?? "Error al eliminar.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-muted-foreground hover:text-destructive transition disabled:opacity-50"
    >
      {isPending ? "…" : label}
    </button>
  );
}
