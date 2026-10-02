"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { voidInvoice } from "@/lib/actions/invoicing";

export function VoidInvoiceButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Anular</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Anular factura</DialogTitle>
          <DialogDescription>
            El cobro se mantiene y se puede volver a facturar con los datos correctos.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Motivo (p. ej. cédula equivocada)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end">
          <Button
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() =>
              start(async () => {
                try {
                  await voidInvoice(id, reason);
                  toast.success("Factura anulada");
                  setOpen(false);
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
