"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { createStaffTask } from "@/lib/actions/staff-tasks";
import { ecuadorDateString } from "@/lib/timezone";
import { addDays } from "@/lib/nutrition/appointments";
import { TYPE_LABEL, type AssignableUser, type PersonRef, type SedeValue, type TaskType } from "@/lib/tasks/meta";
import { PersonPicker } from "@/app/dashboard/tareas/person-picker";
import { AssigneeOptions, POOL } from "@/app/dashboard/tareas/fields";

/** What every inline task form needs to know about the team and who is creating it. */
export type QuickTaskBase = {
  users: AssignableUser[];
  currentUserId: string;
  /** Front-desk roles can leave a task in the sede's pool. */
  canPool: boolean;
  defaultSede: SedeValue | null;
};

const FIELD = "h-8 w-full rounded-md border border-input bg-background px-2 text-xs";

/**
 * "Nueva tarea" right where the staff is working (the WhatsApp chat, a ficha,
 * the nutrition home) instead of a separate page: title, who, when, and the
 * person already attached. Creating it keeps you on the same screen.
 */
export function QuickTaskForm({
  users,
  currentUserId,
  canPool,
  defaultSede,
  person: fixedPerson = null,
  allowPersonPick = false,
  initialTitle = "",
  initialDetail = "",
  onCreated,
  onCancel,
}: QuickTaskBase & {
  /** The task is about this person (not editable here). */
  person?: PersonRef | null;
  /** No fixed person: offer the socio/lead search. */
  allowPersonPick?: boolean;
  initialTitle?: string;
  initialDetail?: string;
  onCreated?: (id: string) => void;
  onCancel?: () => void;
}) {
  const today = ecuadorDateString();
  const tomorrow = addDays(today, 1);
  const [isPending, start] = useTransition();
  const [title, setTitle] = useState(initialTitle);
  const [detail, setDetail] = useState(initialDetail);
  const [assignee, setAssignee] = useState(currentUserId);
  const [sede, setSede] = useState<SedeValue | "">(defaultSede ?? "");
  const [dueDate, setDueDate] = useState(today);
  const [dueTime, setDueTime] = useState("");
  const [type, setType] = useState<TaskType>("TASK");
  const [high, setHigh] = useState(false);
  const [picked, setPicked] = useState<PersonRef | null>(null);
  const person = fixedPerson ?? picked;

  const submit = () => {
    if (isPending) return;
    if (!title.trim()) {
      toast.error("Ponle un título.");
      return;
    }
    start(async () => {
      const pool = assignee === POOL;
      const res = await createStaffTask({
        title,
        detail,
        type,
        priority: high ? 1 : 0,
        assigneeId: pool ? null : assignee,
        sede: pool ? sede || null : undefined,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        person: person ? { kind: person.kind, id: person.id } : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const who = pool ? "la recepción" : assignee === currentUserId ? "ti" : (users.find((u) => u.id === assignee)?.name.split(" ")[0] ?? "el equipo");
      toast.success(`Tarea creada para ${who}.`);
      setTitle("");
      setDetail("");
      setDueTime("");
      setHigh(false);
      if (!fixedPerson) setPicked(null);
      onCreated?.(res.id);
    });
  };

  const chip = (value: string, label: string) => (
    <button
      type="button"
      onClick={() => {
        setDueDate(value);
        if (!value) setDueTime("");
      }}
      className={`h-7 rounded-full border px-2.5 text-[11px] font-medium transition ${
        dueDate === value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape" && onCancel) {
          onCancel();
        }
      }}
      className="space-y-2"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="¿Qué hay que hacer? (p. ej. Llamar para agendar la evaluación)"
        autoFocus
        maxLength={200}
        className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-primary"
      />

      {person ? (
        <div className="flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1 text-xs">
          <span className="truncate">
            Sobre <span className="font-medium">{person.name}</span>{" "}
            <span className="text-muted-foreground">· {person.kind === "member" ? "Socio" : "Lead"}</span>
          </span>
          {!fixedPerson && (
            <button type="button" onClick={() => setPicked(null)} aria-label="Quitar persona">
              <X className="size-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      ) : (
        allowPersonPick && <PersonPicker onPick={(p) => setPicked(p)} />
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-[11px] text-muted-foreground">Responsable</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={FIELD}>
            <AssigneeOptions users={users} currentUserId={currentUserId} canPool={canPool} />
          </select>
        </label>
        {assignee === POOL ? (
          <label className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground">Recepción de</span>
            <select value={sede} onChange={(e) => setSede(e.target.value as SedeValue | "")} className={FIELD}>
              <option value="">Las dos sedes</option>
              <option value="FITNESS_CENTER">Fitness Center</option>
              <option value="XTREME">Xtreme</option>
            </select>
          </label>
        ) : (
          <label className="space-y-0.5">
            <span className="text-[11px] text-muted-foreground">Tipo</span>
            <select value={type} onChange={(e) => setType(e.target.value as TaskType)} className={FIELD}>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[11px] text-muted-foreground">Vence</span>
        {chip(today, "Hoy")}
        {chip(tomorrow, "Mañana")}
        {chip("", "Sin fecha")}
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Fecha de vencimiento"
          className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
        />
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
          disabled={!dueDate}
          aria-label="Hora"
          className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] disabled:opacity-40"
        />
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px]">
          <input type="checkbox" checked={high} onChange={(e) => setHigh(e.target.checked)} className="accent-primary" />
          Urgente
        </label>
      </div>

      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Notas: contexto, qué se acordó… (opcional)"
        className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
      />

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto hidden text-[10px] text-muted-foreground sm:inline">⌘/Ctrl + Enter crea</span>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={isPending} className="h-8 rounded-md px-3 text-xs hover:bg-muted">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          className="h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {isPending ? "Creando…" : "Crear tarea"}
        </button>
      </div>
    </form>
  );
}
