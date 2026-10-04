"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getConversationThread,
  openLeadConversation,
  openMemberConversation,
  sendFichaTemplate,
  sendManualReply,
  type ThreadData,
} from "@/lib/actions/comunicacion";

export type FichaTemplate = { name: string; label: string; preview: string };

const timeFmt = new Intl.DateTimeFormat("es-EC", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Guayaquil",
});

const MEDIA_LABEL: Record<string, string> = {
  audio: "🎤 Audio",
  image: "📷 Foto",
  video: "🎬 Video",
  document: "📄 Documento",
  sticker: "Sticker",
};

/**
 * Escribirle por WhatsApp sin salir de la ficha: el hilo (los últimos 100
 * mensajes), la caja para responder dentro de la ventana de 24h y, fuera de
 * ella, las plantillas aprobadas que se pueden mandar. Lo mismo que el inbox,
 * con la persona ya abierta.
 */
export function WhatsappPanel({
  person,
  hasPhone,
  initial,
  templates,
}: {
  person: { kind: "member" | "lead"; id: string };
  hasPhone: boolean;
  initial: ThreadData | null;
  templates: FichaTemplate[];
}) {
  const router = useRouter();
  const [thread, setThread] = useState<ThreadData | null>(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const conversationId = thread?.conversationId ?? null;

  // Nuevos mensajes sin recargar: cada 15 s mientras la pestaña está a la vista.
  useEffect(() => {
    if (!conversationId) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        setThread(await getConversationThread(conversationId));
      } catch {
        /* se reintenta en el siguiente ciclo */
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [conversationId]);

  const lastId = thread?.messages[thread.messages.length - 1]?.id;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  async function reload(id: string) {
    setThread(await getConversationThread(id));
    router.refresh();
  }

  function open() {
    start(async () => {
      const res = person.kind === "member" ? await openMemberConversation(person.id) : await openLeadConversation(person.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await reload(res.conversationId);
    });
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim()) return;
    start(async () => {
      const res = await sendManualReply(conversationId, text);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setText("");
      await reload(conversationId);
    });
  }

  function sendTemplate(name: string) {
    if (!conversationId) return;
    start(async () => {
      const res = await sendFichaTemplate(conversationId, name);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Plantilla enviada.");
      await reload(conversationId);
    });
  }

  if (!thread) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-sm font-medium">Todavía no hay conversación de WhatsApp.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasPhone
            ? "Ábrela para escribirle desde el número de La Cueva. Como no ha escrito en las últimas 24h, el primer mensaje tiene que ser una plantilla aprobada."
            : "Agrega un celular en su ficha para poder escribirle."}
        </p>
        {hasPhone && (
          <Button className="mt-4" size="sm" onClick={open} disabled={pending}>
            {pending ? "Abriendo…" : "Abrir conversación"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs">
          <span className={`size-2 rounded-full ${thread.windowOpen ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-hidden />
          {thread.windowOpen ? "Ventana de 24h abierta" : "Ventana cerrada: solo plantilla"}
          <span className="text-muted-foreground">· {thread.botPaused ? "Bot en pausa (lo atiende el equipo)" : "El bot está respondiendo"}</span>
        </p>
        <Link href={`/dashboard/comunicacion?c=${thread.conversationId}`} className="text-xs font-medium text-primary hover:underline">
          Abrir en el inbox →
        </Link>
      </div>

      <div className="max-h-[55vh] min-h-48 space-y-2 overflow-y-auto bg-muted/40 px-4 py-4">
        {thread.hasOlder && (
          <p className="text-center text-xs text-muted-foreground">
            Mensajes anteriores en el{" "}
            <Link href={`/dashboard/comunicacion?c=${thread.conversationId}`} className="text-primary hover:underline">
              inbox
            </Link>
            .
          </p>
        )}
        {thread.messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin mensajes todavía.</p>}
        {thread.messages.map((m) => {
          const out = m.direction === "OUTBOUND";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  out ? "bg-emerald-50 text-foreground dark:bg-emerald-950" : "bg-card"
                } ${m.sendStatus === "FAILED" ? "ring-1 ring-destructive" : ""}`}
              >
                {m.mediaKind && (
                  <p className="text-xs font-medium">
                    {m.mediaUrl ? (
                      <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {m.mediaVoice ? "🎤 Nota de voz" : (MEDIA_LABEL[m.mediaKind] ?? m.mediaKind)}
                      </a>
                    ) : (
                      (MEDIA_LABEL[m.mediaKind] ?? m.mediaKind)
                    )}
                  </p>
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <p className="mt-1 text-right text-[10.5px] text-muted-foreground">
                  {out ? `${m.senderLabel} · ` : ""}
                  {timeFmt.format(new Date(m.createdAt))}
                  {m.sendStatus === "FAILED" ? " · no se envió" : m.sendStatus === "DRAFT" ? " · borrador" : ""}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {thread.windowOpen ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="Escribe por WhatsApp… (Enter envía, Shift+Enter nueva línea)"
            className="min-h-10 flex-1 resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" size="sm" disabled={pending || !text.trim()}>
            <Send className="size-4" /> {pending ? "Enviando…" : "Enviar"}
          </Button>
        </form>
      ) : (
        <div className="space-y-2 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">
            No ha escrito en las últimas 24h: WhatsApp solo deja mandar una plantilla aprobada. Cuando responda, se abre la
            ventana y puedes escribir normal.
          </p>
          {templates.length === 0 && <p className="text-xs text-muted-foreground">No hay plantillas para este caso.</p>}
          {templates.map((t) => (
            <div key={t.name} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.preview}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`¿Enviar la plantilla “${t.label}” por WhatsApp?`)) sendTemplate(t.name);
                  }}
                >
                  Enviar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
