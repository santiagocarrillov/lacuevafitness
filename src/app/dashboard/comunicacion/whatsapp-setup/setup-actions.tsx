"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerPhoneNumber, subscribeAppToWaba } from "@/lib/actions/whatsapp-setup";
import type { ActionResult } from "@/lib/whatsapp/setup-shared";
import { GraphErrorBox } from "./graph-error";

function ResultView({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  if (!result.ok) return <GraphErrorBox error={result.error} />;
  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
      <p className="font-medium text-emerald-700 dark:text-emerald-400 text-sm">Respuesta OK</p>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
        {JSON.stringify(result.data, null, 2)}
      </pre>
    </div>
  );
}

export function RegisterNumberForm({ phoneId, display }: { phoneId: string; display: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const valid = /^\d{6}$/.test(pin);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (!confirm(`¿Registrar ${display} en Cloud API con este PIN? Guarda el PIN: queda como PIN de verificación en dos pasos.`)) return;
    startTransition(async () => {
      try {
        const res = await registerPhoneNumber(phoneId, pin);
        setResult(res);
        if (res.ok) {
          toast.success("Número registrado en Cloud API.");
          setPin("");
          router.refresh();
        } else {
          toast.error("Graph API devolvió un error al registrar.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{6}"
          maxLength={6}
          placeholder="PIN 6 dígitos"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-36 font-mono"
          aria-label={`PIN para ${display}`}
        />
        <Button type="submit" size="sm" disabled={!valid || isPending}>
          {isPending ? "Registrando…" : "Registrar en Cloud API"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Este PIN se convierte en el PIN de verificación en dos pasos del número. Guárdalo en un lugar
        seguro: lo necesitarás para volver a registrar o migrar el número.
      </p>
      <ResultView result={result} />
    </form>
  );
}

export function SubscribeAppButton({ wabaId }: { wabaId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const res = await subscribeAppToWaba(wabaId);
        setResult(res);
        if (res.ok) {
          toast.success("App suscrita a los webhooks del WABA.");
          router.refresh();
        } else {
          toast.error("Graph API devolvió un error al suscribir.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al suscribir");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" onClick={run} disabled={isPending}>
        {isPending ? "Suscribiendo…" : "Suscribir app al webhook"}
      </Button>
      <ResultView result={result} />
    </div>
  );
}
