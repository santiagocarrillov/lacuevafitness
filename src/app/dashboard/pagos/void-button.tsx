"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { voidPayment } from "@/lib/actions/payments";

/** "Anular" with its reason: the collection stays in the history, out of the books. */
export function VoidPaymentButton({ id, what, after, variant = "link" }: { id: string; what: string; after?: string; variant?: "link" | "button" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          variant === "button" ? (
            <Button type="button" size="sm" variant="outline" className="text-destructive" />
          ) : (
            <button type="button" className="text-xs text-muted-foreground transition hover:text-destructive" />
          )
        }
      >
        anular
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular {what}</DialogTitle>
          <DialogDescription>
            Sale de la contabilidad pero queda en el historial con el motivo, quién y cuándo. No se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Motivo (p. ej. registrado dos veces)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end">
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              start(async () => {
                try {
                  await voidPayment(id, reason);
                  toast.success("Cobro anulado");
                  setOpen(false);
                  if (after) router.push(after);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "No se pudo anular.");
                }
              })
            }
          >
            Anular
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
