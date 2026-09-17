"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  registerPhoneNumber,
  sendTestWhatsappMessage,
  subscribeAppToWaba,
} from "@/lib/actions/whatsapp-setup";
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

/**
 * Envía un mensaje de texto REAL por Cloud API y muestra la respuesta completa
 * de Graph (o el error completo). Es el diagnóstico definitivo: si el agente
 * genera respuestas pero no llegan, aquí se ve el motivo exacto.
 */
export function TestSendForm({ phoneId }: { phoneId: string | null }) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("Prueba desde La Cueva (diagnóstico).");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const phoneOk = /^\+?\d{8,15}$/.test(to.trim());
  const valid = phoneOk && text.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (!confirm(`Esto envía un WhatsApp REAL a ${to.trim()}. ¿Continuar?`)) return;
    startTransition(async () => {
      try {
        const res = await sendTestWhatsappMessage(to, text);
        setResult(res);
        if (res.ok) toast.success("Cloud API aceptó el mensaje.");
        else toast.error("Graph API devolvió un error al enviar.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al enviar");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        <p className="font-medium text-amber-700 dark:text-amber-400 text-sm">
          ⚠️ Esto envía un mensaje de WhatsApp REAL
        </p>
        <p className="mt-1">
          Se hace POST a /{phoneId ?? "WHATSAPP_PHONE_ID"}/messages con un texto plano. El destinatario
          lo recibe en su teléfono. Fuera de la ventana de 24 h, Meta rechaza el texto libre: ese error
          también se muestra aquí, que es justo lo que queremos ver.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground block">Destino (E.164)</span>
          <Input
            inputMode="tel"
            autoComplete="off"
            placeholder="+593981781969"
            value={to}
            onChange={(e) => setTo(e.target.value.replace(/[^\d+]/g, ""))}
            className="w-52 font-mono"
            aria-label="Número destino en formato E.164"
          />
        </label>
        <label className="space-y-1 flex-1 min-w-56">
          <span className="text-xs text-muted-foreground block">Texto</span>
          <Input
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            aria-label="Texto del mensaje de prueba"
          />
        </label>
        <Button type="submit" size="sm" variant="destructive" disabled={!valid || isPending}>
          {isPending ? "Enviando…" : "Enviar mensaje de prueba"}
        </Button>
      </div>
      {to.trim().length > 0 && !phoneOk && (
        <p className="text-xs text-destructive">
          Formato inválido: solo dígitos, opcionalmente con + (8 a 15 dígitos).
        </p>
      )}
      <ResultView result={result} />
    </form>
  );
}
