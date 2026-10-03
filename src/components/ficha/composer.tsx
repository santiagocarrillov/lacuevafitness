"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addMemberNote } from "@/lib/actions/notes";
import { addLeadInteraction } from "@/lib/actions/leads";
import type { LeadSource } from "@/generated/prisma/client";

const LEAD_CHANNELS: { value: LeadSource; label: string }[] = [
  { value: "OTHER", label: "Nota" },
  { value: "PHONE_CALL", label: "Llamada" },
  { value: "WHATSAPP", label: "WhatsApp (fuera de la app)" },
  { value: "WALK_IN", label: "Visita / mostrador" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
];

/**
 * Lo que pasa por teléfono o en el mostrador queda escrito aquí. Para un socio
 * es una nota (privada salvo que se comparta); para un lead, una interacción
 * con su canal.
 */
export function Composer({ target }: { target: { kind: "member"; id: string } | { kind: "lead"; id: string } }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);
  const [channel, setChannel] = useState<LeadSource>("OTHER");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    start(async () => {
      try {
        if (target.kind === "member") {
          await addMemberNote({ memberId: target.id, content, visibleToMember: visible });
          toast.success(visible ? "Nota guardada y compartida con el socio." : "Nota guardada.");
        } else {
          await addLeadInteraction({ leadId: target.id, channel, summary: content });
          toast.success("Registrado en la actividad.");
        }
        setText("");
        setVisible(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form id="nota" onSubmit={submit} className="mt-4 scroll-mt-16 rounded-lg border border-border bg-background p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={
          target.kind === "member"
            ? "Escribe una nota… (ej: viaja 2 semanas, regresa el 15)"
            : "¿Qué pasó? (ej: llamó, pregunta por horarios de la tarde)"
        }
        className="w-full resize-y bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {target.kind === "member" ? (
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-3.5 accent-primary" />
            Visible para el socio (aparece en su app)
          </label>
        ) : (
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as LeadSource)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Tipo de registro"
          >
            {LEAD_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" size="sm" className="ml-auto" disabled={pending || !text.trim()}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
