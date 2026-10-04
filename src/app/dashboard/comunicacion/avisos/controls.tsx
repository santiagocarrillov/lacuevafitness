"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { runNoticeKindNow, setNoticeLive } from "@/lib/actions/member-notices";

export function LiveSwitch({ kind, live }: { kind: string; live: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={live}
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await setNoticeLive(kind, !live);
            toast.success(!live ? "Prendido: se enviará cada día a las 10:00 (si Meta lo aprobó)." : "Apagado: queda en modo prueba.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo cambiar.");
          }
        })
      }
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${live ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white text-muted-foreground"}`}
    >
      <span className={`size-2.5 rounded-full ${live ? "bg-white" : "bg-stone-300"}`} />
      {live ? "Prendido" : "Modo prueba"}
    </button>
  );
}

export function RunNowButton({ kind, count }: { kind: string; count: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
      onClick={() => {
        if (!confirm(`¿Enviar ahora a ${count} ${count === 1 ? "persona" : "personas"}?`)) return;
        start(async () => {
          try {
            const r = await runNoticeKindNow(kind);
            toast.success(`${r?.sent ?? 0} enviados${r?.failed ? ` · ${r.failed} fallaron` : ""}.`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo enviar.");
          }
        });
      }}
    >
      {pending ? "Enviando…" : "Enviar ahora"}
    </button>
  );
}
