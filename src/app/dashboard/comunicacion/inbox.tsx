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
  searchInbox,
  searchConversation,
  type ConversationRow,
  type ThreadData,
  type InboxFilter,
  type InboxSearchResult,
  countWaitingForHuman,
} from "@/lib/actions/comunicacion";
import { RESUME_PRESETS, formatResumeAt, type ResumePreset } from "@/lib/whatsapp/bot-handoff";
import { isSearchable } from "@/lib/whatsapp/search";
import { InboxSearchResults } from "./inbox-search";
import { Highlight } from "./highlight";
import { SEDE_LABEL, STAGE_LABEL, dayLabel, timeShort } from "./format";

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
};

export function Inbox({ initialConversations, staff, currentUserId }: Props) {
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

  const hitPosition = useMemo(
    () => (hits.length === 0 ? "" : `${hitIndex + 1} de ${hits.length}${hitsTruncated ? "+" : ""}`),
    [hitIndex, hits.length, hitsTruncated],
  );

  return (
    <div className="flex-1 min-h-0 flex">
      {/* List pane */}
      <div
        className={`w-full md:w-80 lg:w-96 border-r border-border flex flex-col min-h-0 ${
          selectedId ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Buscador global */}
        <div className="p-2 border-b border-border shrink-0">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              🔍
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Buscar nombre, teléfono o mensaje…"
              aria-label="Buscar en todas las conversaciones"
              className="w-full text-xs border border-border rounded-md pl-8 pr-8 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {searching$ && (
              <button
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm leading-none"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Con búsqueda activa las pestañas estorban: los resultados ya son el filtro. */}
        {!searching$ && (
          <>
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
                  {f.key === "waiting" && waiting > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {waiting}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {/* End of shift — hand back everything this user took over today. */}
            <div className="px-2 py-2 border-b border-border shrink-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground shrink-0">Fin de turno:</span>
                <select
                  value=""
                  disabled={pending}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) onEndShift(v as ResumePreset);
                  }}
                  title="Devolver al bot todas mis conversaciones en control humano"
                  className="flex-1 text-xs border border-border rounded-md px-2 py-1 bg-background"
                >
                  <option value="">Devolver mis conversaciones al bot…</option>
                  {RESUME_PRESETS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              {shiftNotice && <p className="text-[11px] text-sky-700 px-0.5">{shiftNotice}</p>}
            </div>
          </>
        )}

        <div className="flex-1 overflow-y-auto">
          {searching$ ? (
            <InboxSearchResults
              query={query}
              result={searchResult}
              loading={searching}
              selectedId={selectedId}
              onOpenChat={(id) => openConversation(id)}
              onOpenMessage={(id, messageId) => openConversation(id, messageId)}
            />
          ) : (
            <>
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
                  <p
                    className={`text-xs truncate mt-0.5 ${
                      c.lastMessageFailed ? "text-red-600 font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {c.lastMessageFailed ? "⚠ No entregado · " : c.lastMessageDirection === "OUTBOUND" ? "↩ " : ""}
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
                      {c.botPaused
                        ? c.botResumeAt
                          ? `🙋 → 🤖 ${formatResumeAt(c.botResumeAt)}`
                          : "🙋 Humano"
                        : "🤖 Bot"}
                    </span>
                    {c.ownerName && (
                      <span className="text-[10px] text-muted-foreground truncate">· {c.ownerName}</span>
                    )}
                  </div>
                </button>
              ))}
            </>
          )}
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
                {thread.botPaused && thread.botResumeAt && (
                  <p className="text-[11px] text-sky-700">
                    🤖 El bot la retoma el {formatResumeAt(thread.botResumeAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
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
                  className={`text-sm px-2.5 py-1.5 rounded-md border transition ${
                    threadSearchOpen
                      ? "border-border bg-accent"
                      : "border-transparent hover:bg-accent/60"
                  }`}
                >
                  🔍
                </button>
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
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => withRefresh(() => resumeBot(thread.conversationId))}
                      disabled={pending}
                      className="text-xs font-medium px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      Devolver al bot
                    </button>
                    {/* Hand it back later — the Friday-afternoon case: nobody is here
                        until Monday, but the lead may write on Saturday. */}
                    <select
                      value=""
                      disabled={pending}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        withRefresh(() => scheduleBotResume(thread.conversationId, v as ResumePreset));
                      }}
                      title="Programar la devolución al bot"
                      className="text-xs border border-border rounded-md px-2 py-1.5 bg-background"
                    >
                      <option value="">⏱ Devolver…</option>
                      {RESUME_PRESETS.filter((r) => r.value !== "now").map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
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

            {/* Buscar dentro de esta conversación */}
            {threadSearchOpen && (
              <div className="px-4 py-2 border-b border-border shrink-0 flex items-center gap-2 bg-muted/30">
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
                  className="flex-1 text-xs border border-border rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
                />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 min-w-[4.5rem] text-right">
                  {isSearchable(threadQuery)
                    ? hits.length === 0
                      ? "sin resultados"
                      : hitPosition
                    : ""}
                </span>
                {/* ↑ va a mensajes más nuevos, ↓ a más viejos: los hits llegan del más reciente al más antiguo. */}
                <button
                  onClick={() => goToHit(hitIndex - 1)}
                  disabled={hits.length === 0}
                  aria-label="Coincidencia más reciente"
                  title="Más reciente"
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-accent disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  onClick={() => goToHit(hitIndex + 1)}
                  disabled={hits.length === 0}
                  aria-label="Coincidencia más antigua"
                  title="Más antigua"
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-accent disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  onClick={closeThreadSearch}
                  aria-label="Cerrar búsqueda"
                  className="text-sm px-2 py-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>
            )}

            {/* Estás leyendo historia vieja: dilo y ofrece la salida. */}
            {anchorId && (
              <div className="px-4 py-1.5 border-b border-border shrink-0 flex items-center justify-between gap-2 bg-amber-50 text-amber-900">
                <span className="text-[11px]">
                  Mostrando mensajes anteriores{thread.anchorMessageId ? "" : " (el mensaje ya no existe)"}.
                </span>
                <button
                  onClick={goToLatest}
                  className="text-[11px] font-medium underline shrink-0"
                >
                  Ir al final ↓
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-muted/20">
              {thread.hasOlder && (
                <p className="text-center text-[10px] text-muted-foreground py-1">
                  Hay mensajes más antiguos que no caben aquí — búscalos con 🔍.
                </p>
              )}
              {thread.messages.map((m, i) => {
                const prev = thread.messages[i - 1];
                const showDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                const outbound = m.direction === "OUTBOUND";
                const failed = outbound && m.sendStatus === "FAILED";
                const focused = m.id === focusId;
                return (
                  <div
                    key={m.id}
                    ref={(el) => {
                      if (el) messageRefs.current.set(m.id, el);
                      else messageRefs.current.delete(m.id);
                    }}
                  >
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
                          focused ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-background " : ""
                        }${
                          failed
                            ? "bg-red-50 border-2 border-red-400"
                            : !outbound
                              ? "bg-background border border-border"
                              : m.isBot
                                ? "bg-sky-50 border border-sky-200"
                                : "bg-emerald-50 border border-emerald-200"
                        }`}
                      >
                        <p className="text-[10px] text-muted-foreground mb-0.5">{m.senderLabel}</p>
                        {m.mediaKind && m.mediaUrl ? (
                          <>
                            {/* Placeholder bodies ("[nota de voz]") are redundant next to the player. */}
                            {!/^\[[a-zá-ú ]+\]$/i.test(m.body.trim()) && (
                              <Highlight text={m.body} query={threadQuery} />
                            )}
                            <MediaAttachment
                              url={m.mediaUrl}
                              kind={m.mediaKind}
                              mimeType={m.mediaMimeType}
                              voice={m.mediaVoice}
                            />
                          </>
                        ) : (
                          <Highlight text={m.body} query={threadQuery} />
                        )}
                        {failed && (
                          <details className="mt-1.5 border-t border-red-300 pt-1.5">
                            <summary
                              className="cursor-pointer text-[11px] font-semibold text-red-700 list-none"
                              title={m.sendError ?? "WhatsApp rechazó el envío."}
                            >
                              ⚠ No entregado — el cliente NO recibió este mensaje
                            </summary>
                            <p className="mt-1 text-[10px] font-mono text-red-700 whitespace-pre-wrap break-all">
                              {m.sendError ?? "Sin detalle del error."}
                            </p>
                            {m.sendAttemptedAt && (
                              <p className="text-[10px] text-red-700/80">
                                Intento: {timeShort(m.sendAttemptedAt)}
                              </p>
                            )}
                          </details>
                        )}
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
