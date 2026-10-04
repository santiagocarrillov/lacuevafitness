"use client";

import { Bot, Hand, MessageCircle } from "lucide-react";
import type { ConversationRow } from "@/lib/actions/comunicacion";
import { formatResumeAt } from "@/lib/whatsapp/bot-handoff";
import { MEMBER_STATUS_COLOR, MEMBER_STATUS_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/leads/stages";
import { SEDE_LABEL, timeShort } from "./format";

// SRXFIT zone colors (globals.css --chart-1..5): the brand's accent palette.
const AVATAR_COLORS = ["#6b4fb5", "#3a8fd1", "#00a99d", "#e0951b", "#e8594a"];

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((w) => /\p{L}/u.test(w))
      .slice(0, 2)
      .map((w) => w.match(/\p{L}/u)?.[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function StageChip({ c }: { c: Pick<ConversationRow, "stage" | "memberStatus"> }) {
  if (c.memberStatus)
    return (
      <span className={`inline-flex rounded-full border px-1.5 py-px text-[10px] font-medium ${MEMBER_STATUS_COLOR[c.memberStatus]}`}>
        {MEMBER_STATUS_LABEL[c.memberStatus]}
      </span>
    );
  if (c.stage)
    return (
      <span className={`inline-flex rounded-full border px-1.5 py-px text-[10px] font-medium ${STAGE_COLOR[c.stage]}`}>
        {STAGE_LABEL[c.stage]}
      </span>
    );
  return null;
}

export function BotChip({ c }: { c: Pick<ConversationRow, "botPaused" | "botResumeAt"> }) {
  return c.botPaused ? (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800"
      title={c.botResumeAt ? `El bot la retoma el ${formatResumeAt(c.botResumeAt)}` : "La atiende el equipo"}
    >
      <Hand className="size-3" /> {c.botResumeAt ? `Bot ${formatResumeAt(c.botResumeAt)}` : "Equipo"}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-1.5 py-px text-[10px] font-medium text-teal-800" title="Responde el agente IA">
      <Bot className="size-3" /> Bot
    </span>
  );
}

/** One conversation in the list or on the board. */
export function ConversationCard({
  c,
  selected,
  onClick,
  compact,
  draggable,
  onDragStart,
}: {
  c: ConversationRow;
  selected?: boolean;
  onClick: () => void;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const time = timeShort(c.lastInboundAt ?? c.lastOutboundAt);
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={`group relative flex w-full gap-3 text-left transition ${
        compact
          ? "rounded-lg border border-border bg-card p-3 shadow-sm hover:border-foreground/25 hover:shadow"
          : `border-b border-border px-3 py-3 hover:bg-muted/50 ${selected ? "bg-muted/70" : "bg-card"}`
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {!compact && selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden />}
      <Avatar name={c.contactName} size={compact ? 32 : 38} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm ${c.needsAttention ? "font-semibold" : "font-medium"}`}>{c.contactName}</span>
          <span className={`shrink-0 text-[11px] ${c.needsAttention ? "font-semibold text-emerald-600" : "text-muted-foreground"}`}>{time}</span>
        </span>
        <span
          className={`mt-0.5 flex items-center gap-1 truncate text-xs ${
            c.lastMessageFailed ? "font-medium text-red-600" : c.needsAttention ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <MessageCircle className={`size-3 shrink-0 ${c.lastMessageFailed ? "" : "text-emerald-500"}`} />
          <span className="truncate">
            {c.lastMessageFailed ? "No entregado · " : c.lastMessageDirection === "OUTBOUND" ? "Tú: " : ""}
            {c.lastMessageBody ?? "—"}
          </span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {!compact && <StageChip c={c} />}
          <BotChip c={c} />
          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{SEDE_LABEL[c.sede] ?? c.sede}</span>
          {c.ownerName && (
            <span className="truncate text-[10px] text-muted-foreground" title={`Responsable: ${c.ownerName}`}>
              · {c.ownerName.split(" ")[0]}
            </span>
          )}
          {c.needsAttention && <span className="ml-auto size-2 shrink-0 rounded-full bg-emerald-500" title="Escribió y nadie ha respondido" />}
        </span>
      </span>
    </button>
  );
}
