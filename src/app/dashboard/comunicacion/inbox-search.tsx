"use client";

import type { InboxSearchResult } from "@/lib/actions/comunicacion";
import { MIN_QUERY_LENGTH } from "@/lib/whatsapp/search";
import { Highlight, HighlightSnippet } from "./highlight";
import { SEDE_LABEL, hitDate } from "./format";
import { MEMBER_STATUS_LABEL } from "@/lib/leads/stages";

type Props = {
  query: string;
  result: InboxSearchResult | null;
  loading: boolean;
  selectedId: string | null;
  onOpenChat: (conversationId: string) => void;
  onOpenMessage: (conversationId: string, messageId: string) => void;
  onWriteMember: (memberId: string) => void;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Resultados de la búsqueda global, en lugar del listado normal.
 *
 * Dos secciones separadas, como WhatsApp: los contactos que se llaman así y los
 * mensajes donde se dijo eso. Mezclarlos esconde justo el que se buscaba.
 */
export function InboxSearchResults({
  query,
  result,
  loading,
  selectedId,
  onOpenChat,
  onOpenMessage,
  onWriteMember,
}: Props) {
  if (query.trim().length < MIN_QUERY_LENGTH) {
    return (
      <p className="p-4 text-xs text-muted-foreground">
        Escribe al menos {MIN_QUERY_LENGTH} letras. Busca por nombre, teléfono o cualquier palabra
        dicha en un chat.
      </p>
    );
  }

  if (!result) {
    return <p className="p-4 text-sm text-muted-foreground">Buscando…</p>;
  }

  const empty =
    result.chats.length === 0 && result.messages.length === 0 && result.members.length === 0;
  if (empty) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          Nada coincide con “{query.trim()}”.
        </p>
        {loading && <p className="text-[11px] text-muted-foreground mt-1">Buscando…</p>}
      </div>
    );
  }

  return (
    <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {result.chats.length > 0 && (
        <>
          <SectionTitle>
            Chats · {result.chats.length}
            {result.chatsTruncated ? "+" : ""}
          </SectionTitle>
          {result.chats.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenChat(c.id)}
              className={`w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-accent/40 transition ${
                selectedId === c.id ? "bg-accent/60" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">
                  <Highlight text={c.contactName} query={query} />
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {SEDE_LABEL[c.sede] ?? c.sede}
                </span>
              </div>
              {c.contactPhone && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <Highlight text={c.contactPhone} query={query} />
                </p>
              )}
            </button>
          ))}
        </>
      )}

      {result.members.length > 0 && (
        <>
          <SectionTitle>Socios · {result.members.length}</SectionTitle>
          {result.members.map((m) => (
            <button
              key={m.memberId}
              onClick={() => onWriteMember(m.memberId)}
              className="w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-accent/40 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">
                  👤 <Highlight text={m.name} query={query} />
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {SEDE_LABEL[m.sede] ?? m.sede}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {MEMBER_STATUS_LABEL[m.status]}
                {m.phone ? " · " : ""}
                {m.phone && <Highlight text={m.phone} query={query} />}
                {" · "}
                <span className="text-primary">
                  {m.conversationId ? "Abrir conversación" : "Escribir"}
                </span>
              </p>
            </button>
          ))}
        </>
      )}

      {result.messages.length > 0 && (
        <>
          <SectionTitle>
            Mensajes · {result.messages.length}
            {result.messagesTruncated ? "+" : ""}
          </SectionTitle>
          {result.messages.map((m) => (
            <button
              key={m.messageId}
              onClick={() => onOpenMessage(m.conversationId, m.messageId)}
              className="w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-accent/40 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm truncate">{m.contactName}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {hitDate(m.createdAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">
                <span className="text-foreground/60">{m.senderLabel}: </span>
                <HighlightSnippet text={m.body} query={query} />
              </p>
            </button>
          ))}
        </>
      )}

      {(result.chatsTruncated || result.messagesTruncated) && (
        <p className="px-3 py-3 text-[11px] text-muted-foreground">
          Hay más resultados. Afina la búsqueda con una palabra más específica.
        </p>
      )}
    </div>
  );
}
