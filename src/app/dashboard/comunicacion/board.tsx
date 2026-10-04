"use client";

import { useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ConversationRow } from "@/lib/actions/comunicacion";
import type { LeadStage } from "@/generated/prisma/client";
import { ConversationCard } from "./ui";

type ColumnKey = LeadStage | "SOCIOS" | "CERRADOS";

/**
 * The pipeline as columns (Kanban): every conversation sits in its person's
 * stage. Drag a lead's card to move it; socios live in their own column
 * because their state comes from their membership, not from the funnel.
 */
const COLUMNS: { key: ColumnKey; label: string; bar: string; dropStage?: LeadStage }[] = [
  { key: "NEW", label: "Nuevo", bar: "bg-blue-500", dropStage: "NEW" },
  { key: "CONTACTED", label: "Contactado", bar: "bg-indigo-500", dropStage: "CONTACTED" },
  { key: "QUALIFIED", label: "Calificado", bar: "bg-sky-500", dropStage: "QUALIFIED" },
  { key: "SCHEDULED_TRIAL", label: "Agendado", bar: "bg-purple-500", dropStage: "SCHEDULED_TRIAL" },
  { key: "TRIAL_NO_SHOW", label: "No asistió", bar: "bg-amber-500", dropStage: "TRIAL_NO_SHOW" },
  { key: "TRIAL_ATTENDED", label: "En evaluación", bar: "bg-teal-500" },
  { key: "NEGOTIATING", label: "Negociando", bar: "bg-orange-500", dropStage: "NEGOTIATING" },
  { key: "SOCIOS", label: "Socios", bar: "bg-emerald-500" },
  { key: "CERRADOS", label: "Perdidos / no califica", bar: "bg-zinc-400", dropStage: "LOST" },
];

function columnOf(c: ConversationRow): ColumnKey {
  if (c.memberStatus || c.stage === "CONVERTED" || !c.stage) return "SOCIOS";
  if (c.stage === "LOST" || c.stage === "DISQUALIFIED") return "CERRADOS";
  return c.stage;
}

export function Board({
  conversations,
  onOpen,
  onMove,
  pending,
}: {
  conversations: ConversationRow[];
  onOpen: (id: string) => void;
  onMove: (leadId: string, stage: LeadStage) => void;
  pending: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<ColumnKey>>(new Set(["CERRADOS"]));
  const [over, setOver] = useState<ColumnKey | null>(null);
  const byColumn = new Map<ColumnKey, ConversationRow[]>();
  for (const c of conversations) {
    const k = columnOf(c);
    byColumn.set(k, [...(byColumn.get(k) ?? []), c]);
  }
  const toggle = (k: ColumnKey) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className={`flex min-h-0 flex-1 gap-3 overflow-x-auto bg-muted/50 p-4 ${pending ? "opacity-70" : ""}`}>
      {COLUMNS.map((col) => {
        const items = byColumn.get(col.key) ?? [];
        const waiting = items.filter((c) => c.needsAttention).length;
        if (collapsed.has(col.key)) {
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => toggle(col.key)}
              className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-card py-3 text-xs text-muted-foreground shadow-sm hover:text-foreground"
              title={`Mostrar ${col.label}`}
            >
              <ChevronsRight className="size-4" />
              <span className="[writing-mode:vertical-rl] font-medium">
                {col.label} · {items.length}
              </span>
            </button>
          );
        }
        return (
          <section
            key={col.key}
            onDragOver={(e) => {
              if (!col.dropStage) return;
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
            onDrop={(e) => {
              setOver(null);
              const leadId = e.dataTransfer.getData("text/lead");
              const from = e.dataTransfer.getData("text/column");
              if (!leadId || !col.dropStage || from === col.key) return;
              onMove(leadId, col.dropStage);
            }}
            className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/60 transition ${
              over === col.key ? "border-primary ring-2 ring-primary/20" : "border-border"
            }`}
          >
            <header className="px-3 pb-2 pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <button type="button" onClick={() => toggle(col.key)} className="text-muted-foreground hover:text-foreground" title="Plegar columna">
                  <ChevronsLeft className="size-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {items.length} conversaci{items.length === 1 ? "ón" : "ones"}
                {waiting > 0 && <span className="font-medium text-emerald-600"> · {waiting} por responder</span>}
              </p>
              <div className={`mt-2 h-1 rounded-full ${col.bar}`} />
            </header>
            <div className="min-h-24 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
              {items.length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {col.dropStage ? "Arrastra aquí" : "Vacía"}
                </p>
              )}
              {items.map((c) => {
                const canDrag = !!c.leadId && !c.memberStatus;
                return (
                  <ConversationCard
                    key={c.id}
                    c={c}
                    compact
                    onClick={() => onOpen(c.id)}
                    draggable={canDrag}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/lead", c.leadId!);
                      e.dataTransfer.setData("text/column", col.key);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
