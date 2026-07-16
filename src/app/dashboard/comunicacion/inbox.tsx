"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  getConversations,
  getConversationThread,
  assignConversation,
  takeOverConversation,
  resumeBot,
  sendManualReply,
  type ConversationRow,
  type ThreadData,
  type InboxFilter,
} from "@/lib/actions/comunicacion";

const SEDE_LABEL: Record<string, string> = {
  FITNESS_CENTER: "Fitness",
  XTREME: "Xtreme",
};

const STAGE_LABEL: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  SCHEDULED_TRIAL: "Agendado",
  TRIAL_ATTENDED: "Asistió",
  TRIAL_NO_SHOW: "No asistió",
  NEGOTIATING: "Negociando",
  CONVERTED: "Cerrado",
  LOST: "Perdido",
};

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "unassigned", label: "Sin asignar" },
  { key: "mine", label: "Mías" },
];

const POLL_MS = 12_000;

function timeShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

function dayLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short" }).format(new Date(iso));
}

type Props = {
  initialConversations: ConversationRow[];
  staff: Array<{ id: string; name: string }>;
  currentUserId: string;
};

export function Inbox({ initialConversations, staff, currentUserId }: Props) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [conversations, setConversations] = useState<ConversationRow[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const filterRef = useRef<InboxFilter>(filter);
  filterRef.current = filter;
  const threadEndRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async (f: InboxFilter) => {
    try {
      setConversations(await getConversations(f));
    } catch {
      /* keep last good list on transient errors */
    }
  }, []);

  const refreshThread = useCallback(async (id: string) => {
    try {
      setThread(await getConversationThread(id));
    } catch {
      /* keep last good thread */
    }
  }, []);

  // Refetch when the filter changes.
  useEffect(() => {
    refreshList(filter);
  }, [filter, refreshList]);

  // Poll list + open thread.
  useEffect(() => {
    const t = setInterval(() => {
      refreshList(filterRef.current);
      if (selectedRef.current) refreshThread(selectedRef.current);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refreshList, refreshThread]);

  // Scroll to the newest message when the thread grows.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length, selectedId]);

  const openConversation = useCallback(
    (id: string) => {
      setSelectedId(id);
      setThread(null);
      setError(null);
      setReply("");
      refreshThread(id);
    },
    [refreshThread],
  );

  function withRefresh(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      await refreshList(filterRef.current);
      if (selectedRef.current) await refreshThread(selectedRef.current);
    });
  }

  async function onSend() {
    if (!thread || !reply.trim() || sending) return;
    setSending(true);
    setError(null);
    const res = await sendManualReply(thread.conversationId, reply);
    setSending(false);
    if (res.ok) {
      setReply("");
      await refreshThread(thread.conversationId);
      await refreshList(filterRef.current);
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex">
      {/* List pane */}
      <div
        className={`w-full md:w-80 lg:w-96 border-r border-border flex flex-col min-h-0 ${
          selectedId ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex gap-1 p-2 border-b border-border shrink-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f.key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No hay conversaciones en este filtro.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`w-full text-left px-3 py-3 border-b border-border/60 hover:bg-accent/40 transition ${
                selectedId === c.id ? "bg-accent/60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate flex items-center gap-1.5">
                  {c.needsAttention && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                  {c.leadName}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">{timeShort(c.lastInboundAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {c.lastMessageDirection === "OUTBOUND" ? "↩ " : ""}
                {c.lastMessageBody ?? "—"}
              </p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {SEDE_LABEL[c.sede] ?? c.sede}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {STAGE_LABEL[c.stage] ?? c.stage}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    c.botPaused ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {c.botPaused ? "🙋 Humano" : "🤖 Bot"}
                </span>
                {c.ownerName && (
                  <span className="text-[10px] text-muted-foreground truncate">· {c.ownerName}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread pane */}
      <div className={`flex-1 flex flex-col min-h-0 ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!thread ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            {selectedId ? "Cargando…" : "Selecciona una conversación"}
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden text-xs text-muted-foreground mb-1"
                >
                  ← Volver
                </button>
                <p className="font-semibold text-sm truncate">{thread.leadName}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {SEDE_LABEL[thread.sede] ?? thread.sede} · {STAGE_LABEL[thread.stage] ?? thread.stage}
                  {thread.leadPhone ? ` · ${thread.leadPhone}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={thread.ownerUserId ?? "unassigned"}
                  disabled={pending}
                  onChange={(e) => {
                    const v = e.target.value;
                    withRefresh(() => assignConversation(thread.leadId, v === "unassigned" ? null : v));
                  }}
                  className="text-xs border border-border rounded-md px-2 py-1.5 bg-background max-w-[9rem]"
                >
                  <option value="unassigned">Sin asignar</option>
                  {!staff.some((s) => s.id === currentUserId) && <option value={currentUserId}>Asignarme a mí</option>}
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id === currentUserId ? `${s.name} (yo)` : s.name}
                    </option>
                  ))}
                </select>
                {thread.botPaused ? (
                  <button
                    onClick={() => withRefresh(() => resumeBot(thread.conversationId))}
                    disabled={pending}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    Devolver al bot
                  </button>
                ) : (
                  <button
                    onClick={() => withRefresh(() => takeOverConversation(thread.conversationId))}
                    disabled={pending}
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    Tomar control
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-muted/20">
              {thread.messages.map((m, i) => {
                const prev = thread.messages[i - 1];
                const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                const outbound = m.direction === "OUTBOUND";
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="text-center my-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {dayLabel(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                          !outbound
                            ? "bg-background border border-border"
                            : m.isBot
                              ? "bg-sky-50 border border-sky-200"
                              : "bg-emerald-50 border border-emerald-200"
                        }`}
                      >
                        <p className="text-[10px] text-muted-foreground mb-0.5">{m.senderLabel}</p>
                        {m.body}
                        <span className="block text-[10px] text-muted-foreground mt-1 text-right">
                          {timeShort(m.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-border p-3 shrink-0">
              {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
              {!thread.windowOpen ? (
                <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                  ⏳ Fuera de la ventana de 24h de WhatsApp. Para reabrir esta conversación se necesita una plantilla aprobada (próximamente en cadencias de seguimiento).
                </p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    rows={2}
                    placeholder={
                      thread.botPaused
                        ? "Escribe tu respuesta…"
                        : "Escribe para tomar el control (el bot se pausa al enviar)…"
                    }
                    className="flex-1 resize-none border border-border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    onClick={onSend}
                    disabled={sending || !reply.trim()}
                    className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-40"
                  >
                    {sending ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
