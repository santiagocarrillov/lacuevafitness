"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emitInvoiceNow, refreshInvoice, sendInvoiceEmail } from "@/lib/actions/invoicing";
import type { InvoiceStatus } from "@/generated/prisma/enums";

const RESULT: Record<string, string> = {
  AUTHORIZED: "Autorizada por el SRI",
  SENT: "Recibida por el SRI: la autorización todavía está en proceso",
  REJECTED: "El SRI la rechazó: revisa los mensajes",
};

export function SriActions({ id, status, certReady, buyerEmail }: { id: string; status: InvoiceStatus; certReady: boolean; buyerEmail: string | null }) {
  const [pending, start] = useTransition();
  const [to, setTo] = useState(buyerEmail ?? "");
  const run = (fn: () => Promise<{ status: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        (r.status === "AUTHORIZED" ? toast.success : toast.message)(RESULT[r.status] ?? r.status);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo completar.");
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "DRAFT" || status === "REJECTED") && (
        <Button size="sm" disabled={pending || !certReady} onClick={() => run(() => emitInvoiceNow(id))} title={certReady ? "" : "Falta configurar la firma electrónica"}>
          {pending ? "Enviando…" : status === "REJECTED" ? "Reenviar al SRI" : "Enviar al SRI"}
        </Button>
      )}
      {status === "SENT" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => refreshInvoice(id))}>
          {pending ? "Consultando…" : "Consultar autorización"}
        </Button>
      )}
      {status === "AUTHORIZED" && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              try {
                const r = await sendInvoiceEmail(id, to);
                toast.success(`Enviada a ${r.to}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "No se pudo enviar.");
              }
            });
          }}
        >
          <Input className="h-8 w-56" type="email" placeholder="correo@cliente.com" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button size="sm" variant="outline" type="submit" disabled={pending || !to}>
            {pending ? "Enviando…" : "Enviar por correo"}
          </Button>
        </form>
      )}
    </div>
  );
}
