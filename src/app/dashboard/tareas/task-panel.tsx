"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CircleCheck,
  Circle,
  CornerDownRight,
  ExternalLink,
  FileText,
  HardDrive,
  MessageCircle,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addTaskComment,
  addTaskLink,
  addTaskWatcher,
  removeTaskWatcher,
  completeStaffTask,
  createStaffTask,
  removeTaskLink,
  reopenStaffTask,
  updateStaffTask,
  type TaskPatch,
} from "@/lib/actions/staff-tasks";
import {
  REPEAT_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
  dueLabel,
  isDriveUrl,
  minutesToTime,
  type AssignableUser,
  type SedeValue,
  type TaskDetail,
  type TaskRepeat,
  type TaskStatus,
  type TaskType,
} from "@/lib/tasks/meta";
import { PersonPicker } from "./person-picker";
import { AssigneeOptions, POOL, SELECT_CLASS } from "./fields";

type Props = {
  task: TaskDetail;
  users: AssignableUser[];
  today: string;
  currentUserId: string;
  canPool: boolean;
  baseQuery: string;
};

export function TaskPanel({ task, users, today, currentUserId, canPool, baseQuery }: Props) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [closing, setClosing] = useState(false);

  const href = (id: string) => `/dashboard/tareas?${baseQuery}&t=${id}`;

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      done?.();
      router.refresh();
    });

  const patch = (p: TaskPatch) => run(() => updateStaffTask(task.id, p));

  const isClosed = task.status === "DONE" || task.status === "CANCELED";
  // A task can be held by someone who has since been deactivated.
  const assigneeListed = !task.assignee || users.some((u) => u.id === task.assignee!.id);

  return (
    <div className={`p-4 md:p-6 space-y-5 ${isPending ? "opacity-70" : ""}`}>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <Link href={`/dashboard/tareas?${baseQuery}`} className="inline-flex items-center gap-1 md:hidden">
            <ArrowLeft className="size-3.5" /> Tareas
          </Link>
          {task.parent ? (
            <Link href={href(task.parent.id)} className="inline-flex items-center gap-1 truncate hover:text-foreground">
              <CornerDownRight className="size-3.5 shrink-0" /> Subtarea de «{task.parent.title}»
            </Link>
          ) : (
            <span className="hidden md:inline" />
          )}
          <Link href={`/dashboard/tareas?${baseQuery}`} aria-label="Cerrar" className="hidden md:inline hover:text-foreground">
            <X className="size-4" />
          </Link>
        </div>
        <TitleEditor
          key={task.title}
          title={task.title}
          done={isClosed}
          onSave={(title) => patch({ title })}
        />
        <p className="text-xs text-muted-foreground">
          {task.isAuto
            ? "Creada automáticamente"
            : task.createdBy
              ? `Creada por ${task.createdBy.name}`
              : "Cargada por el sistema"}{" "}
          ·{" "}
          {new Date(task.createdAt).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}
        </p>
      </div>

      {/* Status / assignee / due */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Field label="Estado" tone={STATUS_TONE[task.status]}>
          <select
            value={task.status}
            onChange={(e) => {
              const s = e.target.value as TaskStatus;
              if (s === "DONE") setClosing(true);
              else if (task.status === "DONE" && s === "TODO") run(() => reopenStaffTask(task.id));
              else patch({ status: s });
            }}
            className="w-full bg-transparent text-sm font-medium outline-none"
          >
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Responsable">
          <select
            value={task.assignee?.id ?? POOL}
            onChange={(e) => patch({ assigneeId: e.target.value === POOL ? null : e.target.value })}
            className="w-full bg-transparent text-sm outline-none"
          >
            {!assigneeListed && <option value={task.assignee!.id}>{task.assignee!.name}</option>}
            {!task.assignee && !canPool && <option value={POOL}>Recepción, sin responsable</option>}
            <AssigneeOptions users={users} currentUserId={currentUserId} canPool={canPool} />
          </select>
        </Field>
        <Field label="Vence">
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <input
              type="time"
              value={minutesToTime(task.dueMinutes)}
              disabled={!task.dueDate}
              onChange={(e) => patch({ dueTime: e.target.value || null })}
              className="w-[5.5rem] bg-transparent text-sm outline-none disabled:opacity-40"
            />
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <InlineSelect
          label="Tipo"
          value={task.type}
          options={Object.entries(TYPE_LABEL)}
          onChange={(v) => patch({ type: v as TaskType })}
        />
        <InlineSelect
          label="Prioridad"
          value={String(task.priority > 0 ? 1 : task.priority < 0 ? -1 : 0)}
          options={[["1", "Alta"], ["0", "Normal"], ["-1", "Baja"]]}
          onChange={(v) => patch({ priority: Number(v) })}
        />
        {!task.parent && (
          <InlineSelect
            label="Se repite"
            value={task.repeat ?? ""}
            options={[["", "No"], ...(Object.entries(REPEAT_LABEL) as [string, string][])]}
            onChange={(v) => patch({ repeat: (v || null) as TaskRepeat | null })}
          />
        )}
        {!task.assignee && (
          <InlineSelect
            label="Recepción de"
            value={task.sede ?? ""}
            options={[["", "Las dos sedes"], ["FITNESS_CENTER", "Fitness"], ["XTREME", "Xtreme"]]}
            onChange={(v) => patch({ sede: (v || null) as SedeValue | null })}
          />
        )}
        <span className="text-muted-foreground">{dueLabel(task.dueDate, task.dueMinutes, today)}</span>
      </div>

      {/* Close / closed */}
      {task.status === "DONE" ? (
        <div className="rounded-md border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-sm">
          <p>
            ✓ Hecha por {task.doneByName ?? "alguien"}
            {task.outcome ? `: ${task.outcome}` : "."}
          </p>
          <button
            type="button"
            onClick={() => run(() => reopenStaffTask(task.id))}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Reabrir
          </button>
        </div>
      ) : closing ? (
        <CloseBox
          needsOutcome={!!task.person}
          pending={isPending}
          onCancel={() => setClosing(false)}
          onConfirm={(outcome) => run(() => completeStaffTask(task.id, outcome), () => setClosing(false))}
        />
      ) : task.status !== "CANCELED" ? (
        <Button size="sm" variant="outline" onClick={() => setClosing(true)}>
          <CircleCheck className="size-4" /> Marcar hecha
        </Button>
      ) : null}

      {/* Person */}
      <Section title="Socio o lead">
        <PersonBlock
          task={task}
          onPick={(p) => patch({ person: p ? { kind: p.kind, id: p.id } : null })}
        />
      </Section>

      {/* Notes */}
      <Section title="Notas">
        <NotesEditor key={task.detail ?? ""} detail={task.detail} onSave={(detail) => patch({ detail })} />
      </Section>

      {/* Subtasks */}
      {!task.parent && (
        <Section title={`Subtareas${task.subtasks.length ? ` · ${task.subtaskDone}/${task.subtaskCount}` : ""}`}>
          <ul className="divide-y divide-border rounded-md border border-border empty:hidden">
            {task.subtasks.map((s) => (
              <li key={s.id}>
                <Link href={href(s.id)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60">
                  {s.status === "DONE" ? (
                    <CircleCheck className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={`flex-1 truncate ${s.status === "DONE" ? "line-through text-muted-foreground" : ""}`}>
                    {s.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.assignee?.name.split(" ")[0] ?? "Recepción"}
                    {s.dueDate ? ` · ${dueLabel(s.dueDate, s.dueMinutes, today)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <SubtaskForm
            users={users}
            currentUserId={currentUserId}
            canPool={canPool}
            defaultAssignee={task.assignee?.id ?? currentUserId}
            pending={isPending}
            onCreate={(title, assignee, dueDate) =>
              run(() =>
                createStaffTask({
                  title,
                  parentId: task.id,
                  assigneeId: assignee === POOL ? null : assignee,
                  dueDate: dueDate || null,
                }),
              )
            }
          />
        </Section>
      )}

      {/* Documents */}
      <Section title="Documentos">
        {task.links.length > 0 && (
          <ul className="space-y-1">
            {task.links.map((l) => (
              <li key={l.id} className="group flex items-center gap-2 text-sm">
                {isDriveUrl(l.url) ? (
                  <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                )}
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary hover:underline">
                  {l.label ?? l.url}
                </a>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  aria-label="Quitar documento"
                  onClick={() => {
                    if (confirm(`¿Quitar «${l.label ?? l.url}» de esta tarea?`)) run(() => removeTaskLink(l.id));
                  }}
                  className="ml-auto text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive focus:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <LinkForm pending={isPending} onAdd={(url, label, reset) => run(() => addTaskLink(task.id, url, label), reset)} />
      </Section>

      {/* Followers */}
      <Section title="Seguidores">
        <Watchers
          task={task}
          users={users}
          currentUserId={currentUserId}
          onAdd={(uid) => run(() => addTaskWatcher(task.id, uid))}
          onRemove={(uid) => run(() => removeTaskWatcher(task.id, uid))}
        />
      </Section>

      {/* Activity */}
      <Section title="Actividad">
        <ul className="space-y-2">
          {task.entries.map((e) =>
            e.kind === "EVENT" ? (
              <li key={e.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{e.authorName ?? "Sistema"}</span>{" "}
                {lowerFirst(e.body)} · {when(e.createdAt)}
              </li>
            ) : (
              <li key={e.id} className="flex gap-2">
                <Avatar name={e.authorName} mine={e.authorId === currentUserId} />
                <div className="min-w-0 flex-1 rounded-md bg-muted/60 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{e.authorName ?? "Alguien"}</span> · {when(e.createdAt)}
                  </p>
                  <p className="text-sm whitespace-pre-line break-words">
                    <WithMentions text={e.body} users={users} />
                  </p>
                </div>
              </li>
            ),
          )}
        </ul>
        <CommentForm
          users={users}
          currentUserId={currentUserId}
          pending={isPending}
          onSend={(body, reset) => run(() => addTaskComment(task.id, body), reset)}
        />
      </Section>
    </div>
  );
}

// ─── pieces ──────────────────────────────────────────────────────────────────

function Field({ label, tone, children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-md px-3 py-2 ${tone ?? "bg-muted/60"}`}>
      <p className="text-[11px] opacity-70">{label}</p>
      {children}
    </div>
  );
}

function InlineSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent outline-none">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function TitleEditor({ title, done, onSave }: { title: string; done: boolean; onSave: (t: string) => void }) {
  const [value, setValue] = useState(title);
  const commit = () => {
    if (value.trim() && value.trim() !== title) onSave(value);
    else setValue(title);
  };
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setValue(title);
      }}
      aria-label="Título"
      className={`w-full bg-transparent text-xl font-semibold outline-none border-b border-transparent focus:border-border ${
        done ? "line-through text-muted-foreground" : ""
      }`}
    />
  );
}

function NotesEditor({ detail, onSave }: { detail: string | null; onSave: (d: string) => void }) {
  const [value, setValue] = useState(detail ?? "");
  const dirty = value !== (detail ?? "");
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={Math.min(12, Math.max(3, value.split("\n").length + 1))}
        placeholder="Contexto, qué se acordó, qué falta…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onSave(value)}>Guardar notas</Button>
          <Button size="sm" variant="ghost" onClick={() => setValue(detail ?? "")}>Descartar</Button>
        </div>
      )}
    </div>
  );
}

function CloseBox({
  needsOutcome,
  pending,
  onCancel,
  onConfirm,
}: {
  needsOutcome: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (outcome: string) => void;
}) {
  const [outcome, setOutcome] = useState("");
  return (
    <form
      className="space-y-2 rounded-md border border-primary/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(outcome);
      }}
    >
      <p className="text-sm font-medium">¿Qué pasó?</p>
      <p className="text-xs text-muted-foreground">
        {needsOutcome
          ? "Obligatorio: queda también en el historial de la persona."
          : "Opcional: una línea para quien la revise después."}
      </p>
      <Input
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        placeholder="Confirmó, no contesta, reagendó al miércoles…"
        className="h-8 text-sm"
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || (needsOutcome && !outcome.trim())}>
          Marcar hecha
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

function PersonBlock({
  task,
  onPick,
}: {
  task: TaskDetail;
  onPick: (p: { kind: "lead" | "member"; id: string } | null) => void;
}) {
  const [changing, setChanging] = useState(false);
  if (task.person && !changing) {
    const p = task.person;
    const fileHref =
      p.kind === "member"
        ? `/dashboard/socios/${p.id}`
        : `/dashboard/leads/${p.id}`;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={fileHref} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 hover:bg-accent">
          <User className="size-3.5" /> {p.name}
          <span className="text-xs text-muted-foreground">· {p.kind === "member" ? "Socio" : "Lead"}</span>
        </Link>
        {task.conversationId && (
          <Link
            href={`/dashboard/comunicacion?c=${task.conversationId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 hover:bg-accent"
          >
            <MessageCircle className="size-3.5" /> Abrir chat
          </Link>
        )}
        <button type="button" onClick={() => setChanging(true)} className="text-xs text-muted-foreground hover:text-foreground">
          Cambiar
        </button>
        <button type="button" onClick={() => onPick(null)} className="text-xs text-muted-foreground hover:text-destructive">
          Quitar
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <PersonPicker
        autoFocus={changing}
        onPick={(p) => {
          setChanging(false);
          onPick(p);
        }}
      />
      {changing && (
        <button type="button" onClick={() => setChanging(false)} className="text-xs text-muted-foreground">
          Cancelar
        </button>
      )}
    </div>
  );
}

function SubtaskForm({
  users,
  currentUserId,
  canPool,
  defaultAssignee,
  pending,
  onCreate,
}: {
  users: AssignableUser[];
  currentUserId: string;
  canPool: boolean;
  defaultAssignee: string;
  pending: boolean;
  onCreate: (title: string, assignee: string, dueDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [dueDate, setDueDate] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Plus className="size-3.5" /> Agregar subtarea
      </button>
    );
  }
  return (
    <form
      className="space-y-2 rounded-md border border-border p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onCreate(title, assignee, dueDate);
        setTitle("");
        setDueDate("");
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Registrar 6 membresías" className="h-8 text-sm" autoFocus />
      <div className="flex flex-col sm:flex-row gap-2">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={SELECT_CLASS}>
          <AssigneeOptions users={users} currentUserId={currentUserId} canPool={canPool} />
        </select>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 sm:w-40" />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending || !title.trim()}>Agregar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Listo</Button>
        </div>
      </div>
    </form>
  );
}

function LinkForm({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (url: string, label: string, reset: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <Plus className="size-3.5" /> Agregar enlace de Drive
      </button>
    );
  }
  return (
    <form
      className="flex flex-col sm:flex-row gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(url, label, () => {
          setUrl("");
          setLabel("");
          setOpen(false);
        });
      }}
    >
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" className="h-8 text-sm" autoFocus />
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Contrato firmado" className="h-8 text-sm sm:w-48" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !url.trim()}>Agregar</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}

function CommentForm({
  users,
  currentUserId,
  pending,
  onSend,
}: {
  users: AssignableUser[];
  currentUserId: string;
  pending: boolean;
  onSend: (body: string, reset: () => void) => void;
}) {
  const [body, setBody] = useState("");
  // The "@algo" being typed right before the caret, if any.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const track = (value: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(value.slice(0, caret));
    setMention(m ? { query: m[2].toLocaleLowerCase("es"), start: caret - m[2].length - 1 } : null);
  };

  const matches = mention
    ? users
        .filter((u) => u.id !== currentUserId)
        .filter((u) =>
          u.name
            .toLocaleLowerCase("es")
            .split(/\s+/)
            .some((w) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").startsWith(
              mention.query.normalize("NFD").replace(/[̀-ͯ]/g, ""),
            )),
        )
        .slice(0, 6)
    : [];

  const pick = (u: AssignableUser) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, mention.start)}@${u.name} ${body.slice(caret)}`;
    setBody(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + u.name.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const send = () => {
    if (body.trim()) onSend(body, () => setBody(""));
  };

  return (
    <form
      className="relative space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          track(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (mention && matches.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault();
            pick(matches[0]);
            return;
          }
          if (e.key === "Escape") setMention(null);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
        }}
        rows={2}
        placeholder="Escribe un comentario… usa @ para mencionar a alguien"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {mention && matches.length > 0 && (
        <ul className="absolute left-2 top-full z-10 -mt-1 w-64 overflow-hidden rounded-md border border-border bg-background text-sm shadow-md">
          {matches.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
                className="block w-full px-3 py-1.5 text-left hover:bg-accent"
              >
                {u.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {body.trim() && (
        <Button type="submit" size="sm" disabled={pending}>Comentar</Button>
      )}
    </form>
  );
}

/** Comment text with "@Nombre Apellido" of staff shown in bold. */
function WithMentions({ text, users }: { text: string; users: AssignableUser[] }) {
  const names = users.map((u) => u.name).sort((a, b) => b.length - a.length);
  if (names.length === 0 || !text.includes("@")) return <>{text}</>;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(@(?:${escaped.join("|")}))`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-medium text-primary">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Watchers({
  task,
  users,
  currentUserId,
  onAdd,
  onRemove,
}: {
  task: TaskDetail;
  users: AssignableUser[];
  currentUserId: string;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const following = task.watchers.some((w) => w.id === currentUserId);
  const involved = new Set([task.assignee?.id, task.createdBy?.id, ...task.watchers.map((w) => w.id)]);
  const candidates = users.filter((u) => !involved.has(u.id) && u.id !== currentUserId);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {task.watchers.length === 0 && (
          <span className="text-xs text-muted-foreground">
            Nadie más. Los seguidores reciben los comentarios y pueden abrir la tarea.
          </span>
        )}
        {task.watchers.map((w) => (
          <span key={w.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
            {w.name}
            <button type="button" aria-label={`Quitar a ${w.name}`} onClick={() => onRemove(w.id)}>
              <X className="size-3 text-muted-foreground hover:text-destructive" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {task.assignee?.id !== currentUserId && task.createdBy?.id !== currentUserId && (
          <button
            type="button"
            onClick={() => (following ? onRemove(currentUserId) : onAdd(currentUserId))}
            className="text-muted-foreground hover:text-foreground"
          >
            {following ? "Dejar de seguir" : "Seguir esta tarea"}
          </button>
        )}
        {candidates.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && onAdd(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1"
            aria-label="Agregar seguidor"
          >
            <option value="">+ Agregar seguidor…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function Avatar({ name, mine }: { name: string | null; mine: boolean }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
        mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
      }`}
    >
      {initials}
    </span>
  );
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function when(iso: string) {
  return new Date(iso).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
