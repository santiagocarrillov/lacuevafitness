"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { sendTestsNotice } from "@/lib/actions/member-notices";

/** Only after the sede tried to evaluate and couldn't. */
export function SendTestsNoticeButton({ memberId }: { memberId: string }) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  if (sent) return <span className="text-xs text-emerald-700">Mensaje enviado</span>;
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-full border border-[#25d366] px-2.5 py-1 text-xs font-medium text-[#128c4a] hover:bg-[#25d366]/10"
      onClick={() => {
        if (!confirm("¿Ya intentaron evaluarlo y no se pudo? Se le enviará «Faltan tus tests SRXFIT» por WhatsApp.")) return;
        start(async () => {
          try {
            await sendTestsNotice(memberId);
            setSent(true);
            toast.success("WhatsApp enviado.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo enviar.");
          }
        });
      }}
    >
      {pending ? "Enviando…" : "Ya intentamos: avisar"}
    </button>
  );
}
