"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  getConversations,
  getConversationThread,
  assignConversation,
  takeOverConversation,
  resumeBot,
  scheduleBotResume,
  endShiftReturnToBot,
  sendManualReply,
  setLeadStage,
  searchInbox,
  searchConversation,
  openMemberConversation,
  addConversationNote,
  sendFichaTemplate,
  type ConversationRow,
  type ThreadData,
  type InboxFilter,
  type InboxSearchResult,
  countWaitingForHuman,
} from "@/lib/actions/comunicacion";
import { RESUME_PRESETS, formatResumeAt, type ResumePreset } from "@/lib/whatsapp/bot-handoff";
import { isSearchable } from "@/lib/whatsapp/search";
import { InboxSearchResults } from "./inbox-search";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Columns3, List, ListPlus, Search, Send, StickyNote, X } from "lucide-react";
import { Board } from "./board";
import { ContactPanel } from "./contact-panel";
import { Avatar, BotChip, ConversationCard, StageChip } from "./ui";
import { Highlight } from "./highlight";
import { dayLabel, timeShort } from "./format";
import { LEAD_STAGES } from "@/lib/leads/stages";

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "waiting", label: "Esperando" },
  { key: "unassigned", label: "Sin asignar" },
  { key: "mine", label: "Mías" },
];

const POLL_MS = 12_000;
/** Lo que se espera a que dejen de escribir antes de ir a la base. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Inbound file the lead sent. The <audio>/<img> src hits our authenticated proxy —
 * WhatsApp media is never a public URL. Meta drops the file after ~30 days, so an
 * old voice note fails to load; we say so instead of showing a broken control.
 */
function MediaAttachment({
  url,
  kind,
  mimeType,
  voice,
}: {
  url: string;
  kind: string;
  mimeType: string | null;
  voice: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="text-[11px] text-muted-foreground italic mt-1">
        {voice ? "🎤 Nota de voz" : kind === "image" ? "🖼 Imagen" : "📎 Archivo"} ya no disponible
        (WhatsApp la borra a los 30 días).
      </p>
    );
  }

  if (kind === "audio") {
    return (
      <div className="mt-1 space-y-1">
        <p className="text-[11px] text-muted-foreground">{voice ? "🎤 Nota de voz" : "🎵 Audio"}</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls preload="none" src={url} onError={() => setFailed(true)} className="w-56 max-w-full" />
      </div>
    );
  }

  if (kind === "image" || kind === "sticker") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        {/* Not next/image: the bytes come from an authenticated proxy, not a known host. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={kind === "sticker" ? "Sticker del cliente" : "Imagen del cliente"}
          onError={() => setFailed(true)}
          className="rounded-lg max-h-56 w-auto border border-border"
        />
      </a>
    );
  }

  if (kind === "video") {
    return <video controls preload="none" src={url} onError={() => setFailed(true)} className="mt-1 rounded-lg max-h-56 w-auto" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-block text-xs text-primary underline"
    >
      📎 Abrir archivo{mimeType ? ` (${mimeType.split(";")[0]})` : ""}
    </a>
  );
}

type Props = {
  initialConversations: ConversationRow[];
  staff: Array<{ id: string; name: string }>;
  currentUserId: string;
  /** Conversación a abrir al entrar (`?c=`), p. ej. desde una tarea del Resumen. */
  initialOpenId?: string | null;
  /** "lista" (chat) o "tablero" (columnas por etapa), desde `?vista=`. */
  initialView?: "lista" | "tablero";
};

export function Inbox({
  initialConversations,
  staff,
  currentUserId,
  initialOpenId = null,
  initialView = "lista",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [view, setView] = useState<"lista" | "tablero">(initialView);
  /** Composer: reply on WhatsApp, or an internal note that lands on the ficha. */
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [note, setNote] = useState("");
  /** Bumped after actions so the contact card reloads. */
  const [panelKey, setPanelKey] = useState(0);
  const [filter, setFilter] = useState<InboxFilter>("all");
  /** Cuántas esperan a una persona — se pinta en la pestaña para que no pasen desapercibidas. */
  const [waiting, setWaiting] = useState(0);
  const [conversations, setConversations] = useState<ConversationRow[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);
  const [stageNotice, setStageNotice] = useState<string | null>(null);

  // ── Búsqueda global (todo el inbox) ──────────────────────────────────────
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<InboxSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const searching$ = query.trim().length > 0;

  // ── Búsqueda dentro del chat abierto ─────────────────────────────────────
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadQuery, setThreadQuery] = useState("");
  const [hits, setHits] = useState<string[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const [hitsTruncated, setHitsTruncated] = useState(false);
  /**
   * Mensaje en el que se ancla la carga del hilo. null = la cola (lo de siempre).
   * Se usa para abrir un resultado de hace meses, que no está en los últimos 100.
   */
  const [anchorId, setAnchorId] = useState<string | null>(null);
  /** Mensaje al que hay que saltar y destacar una vez pintado. */
  const [focusId, setFocusId] = useState<string | null>(null);

  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;
  const filterRef = useRef<InboxFilter>(filter);
  filterRef.current = filter;
  const anchorRef = useRef<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const threadSearchInputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  /** Último mensaje al que ya saltamos: el poll de 12s no puede volver a arrastrarte ahí. */
  const scrolledToRef = useRef<string | null>(null);

  // El ancla vive también en un ref porque el poll corre fuera del render. Se
  // escribe a mano en cada salto (para que el siguiente tick ya la vea) y se
  // reconcilia aquí.
  useEffect(() => {
    anchorRef.current = anchorId;
  }, [anchorId]);

  const refreshList = useCallback(async (f: InboxFilter) => {
    try {
      setConversations(await getConversations(f));
    } catch {
      /* keep last good list on transient errors */
    }
  }, []);

  const refreshThread = useCallback(async (id: string, aroundMessageId: string | null = null) => {
    try {
      setThread(await getConversationThread(id, { aroundMessageId }));
    } catch {
      /* keep last good thread */
    }
  }, []);

  // El contador de "esperando" se refresca con la lista, no solo al cambiar de
  // pestaña: una conversación puede caer ahí mientras el inbox está abierto.
  useEffect(() => {
    let alive = true;
    const tick = () => {
      countWaitingForHuman()
        .then((n) => { if (alive) setWaiting(n); })
        .catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Refetch when the filter changes.
  useEffect(() => {
    refreshList(filter);
  }, [filter, refreshList]);

  // Poll list + open thread. El hilo se recarga respetando el ancla: si estás
  // leyendo un resultado de hace tres meses, el poll no puede devolverte al final.
  useEffect(() => {
    const t = setInterval(() => {
      refreshList(filterRef.current);
      if (selectedRef.current) refreshThread(selectedRef.current, anchorRef.current);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refreshList, refreshThread]);

  // Búsqueda global, con espera a que dejes de escribir.
  useEffect(() => {
    const q = query.trim();
    if (!isSearchable(q)) {
      setSearchResult(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const t = setTimeout(() => {
      searchInbox(q)
        .then((r) => { if (alive) setSearchResult(r); })
        .catch(() => { if (alive) setSearchResult(null); })
        .finally(() => { if (alive) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  /**
   * Lleva el hilo hasta `messageId`. Si ya está cargado basta con hacer scroll;
   * si es más viejo que la ventana cargada, se vuelve a pedir el hilo anclado ahí
   * (los resultados de búsqueda suelen quedar fuera de los últimos 100 mensajes).
   */
  const jumpTo = useCallback(
    (messageId: string, conversationId: string) => {
      scrolledToRef.current = null;
      setFocusId(messageId);
      if (messageRefs.current.has(messageId)) return;
      setAnchorId(messageId);
      anchorRef.current = messageId;
      refreshThread(conversationId, messageId);
    },
    [refreshThread],
  );

  // Búsqueda dentro del chat: devuelve ids (del más nuevo al más viejo) y salta al primero.
  useEffect(() => {
    const q = threadQuery.trim();
    const conversationId = selectedId;
    if (!conversationId || !isSearchable(q)) {
      setHits([]);
      setHitIndex(0);
      setHitsTruncated(false);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      searchConversation(conversationId, q)
        .then((r) => {
          if (!alive) return;
          setHits(r.messageIds);
          setHitsTruncated(r.truncated);
          setHitIndex(0);
          if (r.messageIds.length > 0) jumpTo(r.messageIds[0], conversationId);
        })
        .catch(() => undefined);
    }, SEARCH_DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [threadQuery, selectedId, jumpTo]);

  // Scroll al final cuando llegan mensajes nuevos — pero no si estás leyendo un
  // resultado de búsqueda más arriba.
  useEffect(() => {
    if (anchorId || focusId) return;
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length, selectedId, anchorId, focusId]);

  // Saltar al mensaje buscado en cuanto esté pintado — una sola vez por salto,
  // para que el refresco periódico no te devuelva ahí mientras lees alrededor.
  useEffect(() => {
    if (!focusId) {
      scrolledToRef.current = null;
      return;
    }
    if (scrolledToRef.current === focusId) return;
    const el = messageRefs.current.get(focusId);
    if (!el) return;
    scrolledToRef.current = focusId;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusId, thread]);

  const openConversation = useCallback(
    (id: string, aroundMessageId: string | null = null) => {
      setSelectedId(id);
      setThread(null);
      setError(null);
      setReply("");
      setStageNotice(null);
      setThreadSearchOpen(false);
      setThreadQuery("");
      setHits([]);
      setHitIndex(0);
      messageRefs.current.clear();
      scrolledToRef.current = null;
      setAnchorId(aroundMessageId);
      anchorRef.current = aroundMessageId;
      setFocusId(aroundMessageId);
      refreshThread(id, aroundMessageId);
    },
    [refreshThread],
  );

  useEffect(() => {
    if (initialOpenId) openConversation(initialOpenId);
  }, [initialOpenId, openConversation]);

  /** Volver al final del hilo: suelta el ancla y recarga la cola. */
  const goToLatest = useCallback(() => {
    if (!selectedId) return;
    setAnchorId(null);
    anchorRef.current = null;
    setFocusId(null);
    messageRefs.current.clear();
    refreshThread(selectedId, null);
  }, [selectedId, refreshThread]);

  function goToHit(next: number) {
    if (!selectedId || hits.length === 0) return;
    const i = (next + hits.length) % hits.length;
    setHitIndex(i);
    jumpTo(hits[i], selectedId);
  }

  function closeThreadSearch() {
    setThreadSearchOpen(false);
    setThreadQuery("");
    setHits([]);
    setHitIndex(0);
    setFocusId(null);
  }

  /**
   * Cambiar la etapa sin salir de la conversación. Si la persona ya es socia, el
   * servidor lo rechaza: su estado lo manda la ficha del socio, no esta pantalla.
   */
  function onStageChange(leadId: string, stage: string) {
    startTransition(async () => {
      const res = await setLeadStage(leadId, stage as (typeof LEAD_STAGES)[number]);
      setStageNotice(res.ok ? null : res.error);
      await refreshList(filterRef.current);
      if (selectedRef.current) await refreshThread(selectedRef.current, anchorRef.current);
    });
  }

  function withRefresh(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      await refreshList(filterRef.current);
      if (selectedRef.current) await refreshThread(selectedRef.current, anchorRef.current);
    });
  }

  /** End of shift: give every conversation I am holding back to the bot. */
  function onEndShift(preset: ResumePreset) {
    startTransition(async () => {
      const res = await endShiftReturnToBot(preset);
      setShiftNotice(
        res.count === 0
          ? "No tienes conversaciones en control humano."
          : res.resumeAt
            ? `${res.count} conversación(es) vuelven al bot el ${formatResumeAt(res.resumeAt)}.`
            : `${res.count} conversación(es) devueltas al bot.`,
      );
      await refreshList(filterRef.current);
      if (selectedRef.current) await refreshThread(selectedRef.current, anchorRef.current);
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
      // Contestar te devuelve al final: tu mensaje es el último y hay que verlo.
      setAnchorId(null);
      anchorRef.current = null;
      setFocusId(null);
      await refreshThread(thread.conversationId, null);
      await refreshList(filterRef.current);
    } else {
      setError(res.error);
    }
  }

  function switchView(next: "lista" | "tablero") {
    setView(next);
    const params = new URLSearchParams(sp.toString());
    if (next === "tablero") params.set("vista", "tablero");
    else params.delete("vista");
    router.replace(params.toString() ? `${pathname}?${params}` : pathname, { scroll: false });
  }

  async function onSaveNote() {
    if (!thread || !note.trim() || sending) return;
    setSending(true);
    setError(null);
    const res = await addConversationNote(thread.conversationId, note);
    setSending(false);
    if (res.ok) {
      setNote("");
      setPanelKey((k) => k + 1);
    } else setError(res.error);
  }

  async function onSendTemplate(name: string, label: string) {
    if (!thread || sending) return;
    if (!confirm(`¿Enviar la plantilla “${label}” por WhatsApp?`)) return;
    setSending(true);
    setError(null);
    const res = await sendFichaTemplate(thread.conversationId, name);
    setSending(false);
    if (res.ok) {
      await refreshThread(thread.conversationId, null);
      await refreshList(filterRef.current);
    } else setError(res.error);
  }

  const hitPosition = useMemo(
    () => (hits.length === 0 ? "" : `${hitIndex + 1} de ${hits.length}${hitsTruncated ? "+" : ""}`),
    [hitIndex, hits.length, hitsTruncated],
  );

  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 md:px-4">
      <div className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5" role="tablist" aria-label="Vista">
        {(
          [
            { key: "lista", label: "Chats", icon: List },
            { key: "tablero", label: "Tablero", icon: Columns3 },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => switchView(v.key)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
              view === v.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <v.icon className="size-3.5" /> {v.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-xs font-medium transition ${
              filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {f.label}
            {f.key === "waiting" && waiting > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-semibold ${filter === f.key ? "bg-white text-primary" : "bg-emerald-500 text-white"}`}>
                {waiting}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {shiftNotice && <span className="hidden text-[11px] text-teal-700 lg:inline">{shiftNotice}</span>}
        <select
          value=""
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onEndShift(v as ResumePreset);
          }}
          title="Fin de turno: devolver al bot todas las conversaciones que tienes en control"
          className="h-7 rounded-md border border-border bg-card px-2 text-xs"
        >
          <option value="">Fin de turno…</option>
          {RESUME_PRESETS.map((r) => (
            <option key={r.value} value={r.value}>
              Devolver al bot: {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  if (view === "tablero") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {toolbar}
        <Board
          conversations={conversations}
          pending={pending}
          onOpen={(id) => {
            switchView("lista");
            openConversation(id);
          }}
          onMove={(leadId, stage) => onStageChange(leadId, stage)}
        />
        {stageNotice && <p className="shrink-0 border-t border-border bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">{stageNotice}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="flex min-h-0 flex-1">
        {/* List pane */}
        <div className={`w-full flex-col border-r border-border bg-card md:w-80 lg:w-96 min-h-0 ${selectedId ? "hidden md:flex" : "flex"}`}>
          <div className="shrink-0 border-b border-border p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                }}
                placeholder="Buscar nombre, teléfono o mensaje…"
                aria-label="Buscar en todas las conversaciones"
                className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-8 pr-8 text-sm outline-none focus:border-primary focus:bg-card [&::-webkit-search-cancel-button]:hidden"
              />
              {searching$ && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {searching$ ? (
              <InboxSearchResults
                query={query}
                result={searchResult}
                loading={searching}
                selectedId={selectedId}
                onOpenChat={(id) => openConversation(id)}
                onOpenMessage={(id, messageId) => openConversation(id, messageId)}
                onWriteMember={(memberId) => {
                  startTransition(async () => {
                    const res = await openMemberConversation(memberId);
                    if (!res.ok) {
                      setStageNotice(res.error);
                      return;
                    }
                    setQuery("");
                    await refreshList(filterRef.current);
                    openConversation(res.conversationId);
                  });
                }}
              />
            ) : (
              <>
                {conversations.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No hay conversaciones en este filtro.</p>}
                {conversations.map((c) => (
                  <ConversationCard key={c.id} c={c} selected={selectedId === c.id} onClick={() => openConversation(c.id)} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Thread pane */}
        <div className={`min-h-0 flex-1 flex-col bg-card ${selectedId ? "flex" : "hidden md:flex"}`}>
          {!thread ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/40 text-sm text-muted-foreground">
              {selectedId ? "Cargando…" : (
                <>
                  <span className="flex size-12 items-center justify-center rounded-full bg-card shadow-sm">
                    <List className="size-5" />
                  </span>
                  Elige una conversación
                </>
              )}
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-2.5 md:px-4">
                <button onClick={() => setSelectedId(null)} className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden" aria-label="Volver">
                  <ArrowLeft className="size-4" />
                </button>
                <Avatar name={thread.contactName} size={36} />
                <div className="min-w-0 flex-1">
                  {fichaHref(thread) ? (
                    <Link href={fichaHref(thread)!} title="Abrir su ficha" className="block truncate text-sm font-semibold hover:underline">
                      {thread.contactName}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold">{thread.contactName}</p>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {thread.contactPhone && <span className="mr-1">{thread.contactPhone}</span>}
                    <StageChip c={thread} />
                    <BotChip c={thread} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Below xl the contact card is hidden: keep the key control here. */}
                  {thread.botPaused ? (
                    <button
                      onClick={() => withRefresh(() => resumeBot(thread.conversationId))}
                      disabled={pending}
                      className="h-8 rounded-md bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50 xl:hidden"
                    >
                      Devolver al bot
                    </button>
                  ) : (
                    <button
                      onClick={() => withRefresh(() => takeOverConversation(thread.conversationId))}
                      disabled={pending}
                      className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 xl:hidden"
                    >
                      Tomar control
                    </button>
                  )}
                  <Link
                    href={newTaskHref(thread)}
                    title="Crear una tarea sobre esta persona"
                    className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted"
                  >
                    <ListPlus className="size-4" />
                  </Link>
                  <button
                    onClick={() => {
                      if (threadSearchOpen) {
                        closeThreadSearch();
                      } else {
                        setThreadSearchOpen(true);
                        setTimeout(() => threadSearchInputRef.current?.focus(), 0);
                      }
                    }}
                    aria-label="Buscar en esta conversación"
                    title="Buscar en esta conversación"
                    className={`inline-flex size-8 items-center justify-center rounded-md border transition ${
                      threadSearchOpen ? "border-primary bg-muted" : "border-border hover:bg-muted"
                    }`}
                  >
                    <Search className="size-4" />
                  </button>
                </div>
              </div>

              {stageNotice && <p className="shrink-0 border-b border-border bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900">{stageNotice}</p>}

              {/* Buscar dentro de esta conversación */}
              {threadSearchOpen && (
                <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
                  <input
                    ref={threadSearchInputRef}
                    type="search"
                    value={threadQuery}
                    onChange={(e) => setThreadQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closeThreadSearch();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        goToHit(e.shiftKey ? hitIndex - 1 : hitIndex + 1);
                      }
                    }}
                    placeholder="Buscar en este chat…"
                    aria-label="Buscar en este chat"
                    className="h-8 flex-1 rounded-md border border-border bg-card px-3 text-xs outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
                  />
                  <span className="min-w-[4.5rem] shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {isSearchable(threadQuery) ? (hits.length === 0 ? "sin resultados" : hitPosition) : ""}
                  </span>
                  {/* ↑ va a mensajes más nuevos, ↓ a más viejos: los hits llegan del más reciente al más antiguo. */}
                  <button onClick={() => goToHit(hitIndex - 1)} disabled={hits.length === 0} aria-label="Coincidencia más reciente" title="Más reciente" className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:opacity-40">
                    ↑
                  </button>
                  <button onClick={() => goToHit(hitIndex + 1)} disabled={hits.length === 0} aria-label="Coincidencia más antigua" title="Más antigua" className="rounded border border-border bg-card px-2 py-1 text-xs hover:bg-muted disabled:opacity-40">
                    ↓
                  </button>
                  <button onClick={closeThreadSearch} aria-label="Cerrar búsqueda" className="px-1 text-muted-foreground hover:text-foreground">
                    <X className="size-4" />
                  </button>
                </div>
              )}

              {/* Estás leyendo historia vieja: dilo y ofrece la salida. */}
              {anchorId && (
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-amber-50 px-4 py-1.5 text-amber-900">
                  <span className="text-[11px]">Mostrando mensajes anteriores{thread.anchorMessageId ? "" : " (el mensaje ya no existe)"}.</span>
                  <button onClick={goToLatest} className="shrink-0 text-[11px] font-medium underline">
                    Ir al final ↓
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 space-y-2 overflow-y-auto bg-muted/40 px-4 py-4 md:px-6">
                {thread.hasOlder && <p className="py-1 text-center text-[10px] text-muted-foreground">Hay mensajes más antiguos que no caben aquí — búscalos con la lupa.</p>}
                {thread.messages.map((m, i) => {
                  const prev = thread.messages[i - 1];
                  const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                  const outbound = m.direction === "OUTBOUND";
                  const failed = outbound && m.sendStatus === "FAILED";
                  const focused = m.id === focusId;
                  const staffOut = outbound && !m.isBot && !failed;
                  return (
                    <div
                      key={m.id}
                      ref={(el) => {
                        if (el) messageRefs.current.set(m.id, el);
                        else messageRefs.current.delete(m.id);
                      }}
                    >
                      {showDay && (
                        <div className="my-3 text-center">
                          <span className="rounded-full bg-card px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm">{dayLabel(m.createdAt)}</span>
                        </div>
                      )}
                      <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                            focused ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-background " : ""
                          }${
                            failed
                              ? "border-2 border-red-400 bg-red-50"
                              : !outbound
                                ? "rounded-tl-sm border border-border bg-card"
                                : m.isBot
                                  ? "rounded-tr-sm border border-teal-200 bg-teal-50"
                                  : "rounded-tr-sm bg-primary text-primary-foreground"
                          }`}
                        >
                          <p className={`mb-0.5 text-[10px] font-medium ${staffOut ? "text-primary-foreground/70" : m.isBot ? "text-teal-700" : "text-muted-foreground"}`}>
                            {m.senderLabel}
                          </p>
                          {m.mediaKind && m.mediaUrl ? (
                            <>
                              {/* Placeholder bodies ("[nota de voz]") are redundant next to the player. */}
                              {!/^\[[a-zá-ú ]+\]$/i.test(m.body.trim()) && <Highlight text={m.body} query={threadQuery} />}
                              <MediaAttachment url={m.mediaUrl} kind={m.mediaKind} mimeType={m.mediaMimeType} voice={m.mediaVoice} />
                            </>
                          ) : (
                            <Highlight text={m.body} query={threadQuery} />
                          )}
                          {failed && (
                            <details className="mt-1.5 border-t border-red-300 pt-1.5">
                              <summary className="cursor-pointer list-none text-[11px] font-semibold text-red-700" title={m.sendError ?? "WhatsApp rechazó el envío."}>
                                ⚠ No entregado — el cliente NO recibió este mensaje
                              </summary>
                              <p className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] text-red-700">{m.sendError ?? "Sin detalle del error."}</p>
                              {m.sendAttemptedAt && <p className="text-[10px] text-red-700/80">Intento: {timeShort(m.sendAttemptedAt)}</p>}
                            </details>
                          )}
                          <span className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${staffOut ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            <Link href={newTaskHref(thread, m.id)} title="Crear una tarea a partir de este mensaje" className="opacity-60 hover:opacity-100">
                              + tarea
                            </Link>
                            {timeShort(m.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              {/* Composer: reply on WhatsApp, or an internal note */}
              <div className="shrink-0 border-t border-border bg-card">
                <div className="flex gap-4 border-b border-border px-4 text-xs font-medium">
                  {(
                    [
                      { key: "reply", label: "Responder" },
                      { key: "note", label: "Nota interna" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setMode(t.key);
                        setError(null);
                      }}
                      className={`-mb-px border-b-2 py-2 ${mode === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="p-3">
                  {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
                  {mode === "note" ? (
                    <div className="flex items-end gap-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onSaveNote();
                          }
                        }}
                        rows={2}
                        placeholder="Nota para el equipo: no se manda por WhatsApp, queda en su ficha."
                        className="flex-1 resize-none rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={onSaveNote}
                        disabled={sending || !note.trim()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-40"
                      >
                        <StickyNote className="size-4" /> Guardar
                      </button>
                    </div>
                  ) : !thread.windowOpen ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        No ha escrito en las últimas 24h: WhatsApp solo deja mandar una plantilla aprobada. Cuando responda, se abre la ventana.
                      </p>
                      {thread.templates.map((t) => (
                        <div key={t.name} className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{t.label}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{t.preview}</p>
                          </div>
                          <button
                            onClick={() => onSendTemplate(t.name, t.label)}
                            disabled={sending}
                            className="h-8 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                          >
                            Enviar
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            onSend();
                          }
                        }}
                        rows={2}
                        placeholder={
                          thread.botPaused
                            ? "Escribe por WhatsApp… (Enter envía, Shift+Enter nueva línea)"
                            : "Escribe para tomar el control (el bot se pausa al enviar)…"
                        }
                        className="flex-1 resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary focus:bg-card"
                      />
                      <button
                        onClick={onSend}
                        disabled={sending || !reply.trim()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                      >
                        <Send className="size-4" /> {sending ? "Enviando…" : "Enviar"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {thread && (
          <ContactPanel
            thread={thread}
            refreshKey={panelKey}
            staff={staff}
            currentUserId={currentUserId}
            pending={pending}
            onStage={(leadId, stage) => onStageChange(leadId, stage)}
            onAssign={(leadId, userId) => withRefresh(() => assignConversation(leadId, userId))}
            onTakeOver={() => withRefresh(() => takeOverConversation(thread.conversationId))}
            onResume={() => withRefresh(() => resumeBot(thread.conversationId))}
            onSchedule={(preset) => withRefresh(() => scheduleBotResume(thread.conversationId, preset))}
          />
        )}
      </div>
    </div>
  );
}

/** The person's ficha: the socio's if there is one, otherwise the lead's. */
function fichaHref(thread: ThreadData): string | null {
  if (thread.memberId) return `/dashboard/socios/${thread.memberId}`;
  if (thread.leadId) return `/dashboard/leads/${thread.leadId}`;
  return null;
}

/**
 * "+ Tarea" goes to the full-page form with the conversation's person (or, with
 * `messageId`, that message quoted) and comes back to this conversation.
 */
function newTaskHref(thread: ThreadData, messageId?: string): string {
  const q = new URLSearchParams();
  if (messageId) q.set("mensaje", messageId);
  const id = thread.contactKind === "member" ? thread.memberId : thread.leadId;
  if (id) q.set(thread.contactKind === "member" ? "socio" : "lead", id);
  q.set("volver", `/dashboard/comunicacion?c=${thread.conversationId}`);
  return `/dashboard/tareas/nueva?${q}`;
}
