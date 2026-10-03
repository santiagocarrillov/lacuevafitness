"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Circle,
  CircleCheck,
  CornerDownRight,
  ExternalLink,
  FileText,
  HardDrive,
  MessageCircle,
  Phone,
  SkipForward,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  completeStaffTask,
  getFocusContext,
  postponeStaffTask,
  type FocusContext,
} from "@/lib/actions/staff-tasks";
import { sendManualReply } from "@/lib/actions/comunicacion";
import {
  POSTPONE_LABEL,
  SEDE_LABEL,
  TYPE_LABEL,
  dueBucket,
  dueLabel,
  isDriveUrl,
  priorityLabel,
  whatsappDigits,
  type FocusQueueItem,
  type PersonSummary,
  type PostponePreset,
  type TaskView,
} from "@/lib/tasks/meta";
import { dayLabel, timeShort } from "@/app/dashboard/comunicacion/format";

type Tally = { done: number; postponed: number; skipped: number };

export function FocusRunner({
  queue,
  view,
  viewLabel,
  today,
  canInbox,
}: {
  queue: FocusQueueItem[];
  view: TaskView;
  viewLabel: string;
  today: string;
  canInbox: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [ctx, setCtx] = useState<FocusContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [tally, setTally] = useState<Tally>({ done: 0, postponed: 0, skipped: 0 });
  const [outcome, setOutcome] = useState("");
  const [isPending, start] = useTransition();
  const seq = useRef(0);
  const outcomeRef = useRef<HTMLInputElement>(null);

  const current = queue[index] ?? null;

  const load = useCallback(async (id: string) => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const c = await getFocusContext(id);
      if (mine === seq.current) setCtx(c);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!current) return;
    setOutcome("");
    load(current.id);
  }, [current, load]);

  useEffect(() => {
    if (!loading) outcomeRef.current?.focus();
  }, [loading]);

  const next = (k: keyof Tally) => {
    setTally((t) => ({ ...t, [k]: t[k] + 1 }));
    setCtx(null);
    setIndex((i) => i + 1);
  };

  const complete = () =>
    start(async () => {
      if (!current) return;
      const res = await completeStaffTask(current.id, outcome);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      next("done");
    });

  const postpone = (preset: PostponePreset) =>
    start(async () => {
      if (!current) return;
      const res = await postponeStaffTask(current.id, preset);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Pospuesta: ${POSTPONE_LABEL[preset].toLowerCase()}.`);
      next("postponed");
    });

  if (!current) {
    return (
      <div className="p-8 max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold">Listo</h1>
        <p className="text-sm text-muted-foreground">
          Recorriste {queue.length} tarea{queue.length === 1 ? "" : "s"} de «{viewLabel}».
        </p>
        <ul className="text-sm space-y-1">
          <li>✓ {tally.done} hecha{tally.done === 1 ? "" : "s"}</li>
          <li>⏱ {tally.postponed} pospuesta{tally.postponed === 1 ? "" : "s"}</li>
          <li>↷ {tally.skipped} saltada{tally.skipped === 1 ? "" : "s"}</li>
        </ul>
        <Link href={`/dashboard/tareas?view=${view}`} className="inline-block text-sm text-primary hover:underline">
          ← Volver a Tareas
        </Link>
      </div>
    );
  }

  const task = ctx?.task.id === current.id ? ctx.task : null;
  const alreadyClosed = task && (task.status === "DONE" || task.status === "CANCELED");
  const needsOutcome = !!task?.person;

  return (
    <div className="min-h-[calc(100dvh-3rem)] md:min-h-[calc(100dvh-2.75rem)] flex flex-col">
      {/* Progress */}
      <header className="px-4 md:px-6 py-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">Enfocar</span>
            <span className="text-muted-foreground"> · {viewLabel} · </span>
            <span className="tabular-nums">
              {index + 1} de {queue.length}
            </span>
          </p>
          <Link href={`/dashboard/tareas?view=${view}`} className="text-xs text-muted-foreground hover:text-foreground">
            Salir
          </Link>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(index / queue.length) * 100}%` }}
          />
        </div>
      </header>

      <div className={`flex-1 grid lg:grid-cols-2 min-h-0 ${loading ? "opacity-60" : ""}`}>
        {/* Task */}
        <section className="p-4 md:p-6 space-y-5 lg:border-r border-border">
          {!task ? (
            <p className="text-sm text-muted-foreground">{loading ? "Cargando…" : "Esta tarea ya no existe."}</p>
          ) : (
            <>
              <div className="space-y-2">
                {task.parent && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CornerDownRight className="size-3.5" /> Subtarea de «{task.parent.title}»
                  </p>
                )}
                <h1 className="text-2xl font-semibold leading-tight">{task.title}</h1>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Chip tone={dueBucket(task.dueDate, today) === "overdue" ? "text-destructive border-destructive/40" : ""}>
                    {dueLabel(task.dueDate, task.dueMinutes, today)}
                  </Chip>
                  <Chip>{TYPE_LABEL[task.type]}</Chip>
                  {task.priority !== 0 && <Chip>Prioridad {priorityLabel(task.priority).toLowerCase()}</Chip>}
                  <Chip>{task.assignee ? task.assignee.name : "Recepción"}</Chip>
                  {task.createdBy && task.createdBy.id !== task.assignee?.id && (
                    <Chip>Pedida por {task.createdBy.name.split(" ")[0]}</Chip>
                  )}
                </div>
              </div>

              {task.detail && (
                <p className="text-sm whitespace-pre-line rounded-md bg-muted/50 px-3 py-2">{task.detail}</p>
              )}

              {task.subtasks.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subtareas · {task.subtaskDone}/{task.subtaskCount}
                  </p>
                  {task.subtasks.map((s) => (
                    <p key={s.id} className="flex items-center gap-2 text-sm">
                      {s.status === "DONE" ? (
                        <CircleCheck className="size-4 text-emerald-600" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      <span className={s.status === "DONE" ? "line-through text-muted-foreground" : ""}>{s.title}</span>
                      <span className="text-xs text-muted-foreground">· {s.assignee?.name.split(" ")[0] ?? "Recepción"}</span>
                    </p>
                  ))}
                </div>
              )}

              {task.links.length > 0 && (
                <div className="space-y-1">
                  {task.links.map((l) => (
                    <a
                      key={l.id}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      {isDriveUrl(l.url) ? <HardDrive className="size-4" /> : <FileText className="size-4" />}
                      {l.label ?? l.url}
                      <ExternalLink className="size-3" />
                    </a>
                  ))}
                </div>
              )}

              {task.entries.some((e) => e.kind === "COMMENT") && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comentarios</p>
                  {task.entries
                    .filter((e) => e.kind === "COMMENT")
                    .slice(-3)
                    .map((e) => (
                      <p key={e.id} className="text-sm">
                        <span className="font-medium">{e.authorName?.split(" ")[0] ?? "Alguien"}:</span> {e.body}
                      </p>
                    ))}
                </div>
              )}

              {/* Actions */}
              <div className="rounded-lg border border-primary/40 p-4 space-y-3">
                {alreadyClosed ? (
                  <>
                    <p className="text-sm">Alguien ya la cerró{task.doneByName ? ` (${task.doneByName})` : ""}.</p>
                    <Button onClick={() => next("skipped")}>Siguiente</Button>
                  </>
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!needsOutcome || outcome.trim()) complete();
                    }}
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">¿Qué pasó?</p>
                      <Input
                        ref={outcomeRef}
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value)}
                        placeholder={
                          needsOutcome
                            ? "Confirmó, no contesta, reagendó al miércoles… (queda en su historial)"
                            : "Opcional"
                        }
                        disabled={isPending}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="submit" disabled={isPending || (needsOutcome && !outcome.trim())}>
                        <CircleCheck className="size-4" /> Hecha y siguiente
                      </Button>
                      <select
                        value=""
                        disabled={isPending}
                        onChange={(e) => e.target.value && postpone(e.target.value as PostponePreset)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        aria-label="Posponer"
                      >
                        <option value="">⏱ Posponer…</option>
                        {(Object.keys(POSTPONE_LABEL) as PostponePreset[]).map((p) => (
                          <option key={p} value={p}>{POSTPONE_LABEL[p]}</option>
                        ))}
                      </select>
                      <Button type="button" variant="ghost" disabled={isPending} onClick={() => next("skipped")}>
                        <SkipForward className="size-4" /> Saltar
                      </Button>
                      <Link
                        href={`/dashboard/tareas?view=${view}&t=${task.id}`}
                        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                      >
                        Abrir tarea completa ↗
                      </Link>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </section>

        {/* Person + chat */}
        <section className="p-4 md:p-6 space-y-4 border-t lg:border-t-0 border-border min-h-0">
          {task && !task.person && (
            <p className="text-sm text-muted-foreground">Esta tarea no está atada a ningún socio ni lead.</p>
          )}
          {ctx?.person && task && <PersonCard person={ctx.person} />}
          {ctx?.thread && task && (
            <ChatBox
              key={ctx.thread.conversationId}
              ctx={ctx}
              onSent={() => load(task.id)}
            />
          )}
          {task?.person && !ctx?.thread && canInbox && ctx?.person && (
            <p className="text-xs text-muted-foreground">Sin conversación de WhatsApp registrada con esta persona.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={`rounded-md border border-border px-2 py-0.5 ${tone ?? ""}`}>{children}</span>;
}

function PersonCard({ person }: { person: PersonSummary }) {
  const wa = whatsappDigits(person.phone);
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{person.name}</p>
          <p className="text-xs text-muted-foreground">
            {person.kind === "member" ? "Socio" : "Lead"} · {person.status} · {SEDE_LABEL[person.sede]}
          </p>
        </div>
        <Link href={person.href} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <User className="size-3.5" /> Ficha
        </Link>
      </div>
      <ul className="text-sm space-y-0.5">
        {person.facts.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {person.phone && (
        <div className="flex flex-wrap gap-2">
          <a
            href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent"
          >
            <Phone className="size-3.5" /> {person.phone}
          </a>
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Abre WhatsApp en este dispositivo, con el número de la sede"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-accent"
            >
              <MessageCircle className="size-3.5" /> WhatsApp de la sede
            </a>
          )}
        </div>
      )}
      {person.recent.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Últimas notas</p>
          {person.recent.map((r, i) => (
            <p key={i} className="text-xs">
              <span className="text-muted-foreground">
                {dayLabel(r.when)}
                {r.author ? ` · ${r.author.split(" ")[0]}` : ""}:
              </span>{" "}
              {r.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatBox({ ctx, onSent }: { ctx: FocusContext; onSent: () => void }) {
  const thread = ctx.thread!;
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.messages.length]);

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    const res = await sendManualReply(thread.conversationId, reply);
    setSending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setReply("");
    onSent();
  };

  return (
    <div className="rounded-lg border border-border flex flex-col max-h-[60vh]">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs">
        <span className="font-medium">WhatsApp</span>
        <Link href={`/dashboard/comunicacion?c=${thread.conversationId}`} className="text-primary hover:underline">
          Abrir en Comunicación ↗
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 bg-muted/20 min-h-0">
        {thread.messages.length === 0 && <p className="text-xs text-muted-foreground">Sin mensajes.</p>}
        {thread.messages.map((m) => {
          const out = m.direction === "OUTBOUND";
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-sm whitespace-pre-wrap break-words ${
                  m.sendStatus === "FAILED"
                    ? "bg-red-50 border border-red-300"
                    : !out
                      ? "bg-background border border-border"
                      : m.isBot
                        ? "bg-sky-50 border border-sky-200"
                        : "bg-emerald-50 border border-emerald-200"
                }`}
              >
                <p className="text-[10px] text-muted-foreground">
                  {m.senderLabel} · {dayLabel(m.createdAt)} {timeShort(m.createdAt)}
                </p>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-2">
        {thread.windowOpen ? (
          <div className="flex items-end gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={thread.botPaused ? "Escribe tu respuesta…" : "Escribe para tomar el control (el bot se pausa)…"}
              className="flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
            <Button size="sm" onClick={send} disabled={sending || !reply.trim()}>
              {sending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            ⏳ Pasaron más de 24 h desde su último mensaje: WhatsApp no deja escribirle desde aquí sin plantilla.
            Llama o usa el WhatsApp de la sede.
          </p>
        )}
      </div>
    </div>
  );
}
