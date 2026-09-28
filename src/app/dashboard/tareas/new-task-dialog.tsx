"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createStaffTask } from "@/lib/actions/staff-tasks";
import { ecuadorDateString } from "@/lib/timezone";
import {
  TYPE_LABEL,
  type AssignableUser,
  type PersonRef,
  type SedeValue,
  type TaskType,
} from "@/lib/tasks/meta";
import { PersonPicker } from "./person-picker";
import { AssigneeOptions, POOL, SELECT_CLASS } from "./fields";

export function NewTaskButton({
  users,
  currentUserId,
  canPool,
  defaultSede,
  baseQuery,
}: {
  users: AssignableUser[];
  currentUserId: string;
  canPool: boolean;
  defaultSede: SedeValue | null;
  baseQuery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, start] = useTransition();
  const empty = {
    title: "",
    detail: "",
    assignee: currentUserId,
    sede: (defaultSede ?? "") as SedeValue | "",
    dueDate: ecuadorDateString(),
    dueTime: "",
    type: "TASK" as TaskType,
    priority: 0,
  };
  const [form, setForm] = useState(empty);
  const [person, setPerson] = useState<PersonRef | null>(null);

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Ponle un título.");
      return;
    }
    start(async () => {
      const pool = form.assignee === POOL;
      const res = await createStaffTask({
        title: form.title,
        detail: form.detail,
        type: form.type,
        priority: form.priority,
        assigneeId: pool ? null : form.assignee,
        sede: pool ? (form.sede || null) : undefined,
        dueDate: form.dueDate || null,
        dueTime: form.dueTime || null,
        person: person ? { kind: person.kind, id: person.id } : null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Tarea creada.");
      setOpen(false);
      setForm(empty);
      setPerson(null);
      router.push(`/dashboard/tareas?${baseQuery}&t=${res.id}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-medium h-8 px-3">
        + Nueva tarea
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>Para ti o para alguien del equipo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Título *</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Llamar a Ana por la renovación"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Responsable</Label>
              <select
                value={form.assignee}
                onChange={(e) => set("assignee", e.target.value)}
                className={SELECT_CLASS}
              >
                <AssigneeOptions users={users} currentUserId={currentUserId} canPool={canPool} />
              </select>
            </div>
            {form.assignee === POOL ? (
              <div className="space-y-1">
                <Label>Recepción de</Label>
                <select
                  value={form.sede}
                  onChange={(e) => set("sede", e.target.value as SedeValue | "")}
                  className={SELECT_CLASS}
                >
                  <option value="">Las dos sedes</option>
                  <option value="FITNESS_CENTER">Fitness Center</option>
                  <option value="XTREME">Xtreme</option>
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  value={form.type}
                  onChange={(e) => set("type", e.target.value as TaskType)}
                  className={SELECT_CLASS}
                >
                  {Object.entries(TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-1">
              <Label>Vence</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label>Hora</Label>
              <Input
                type="time"
                value={form.dueTime}
                onChange={(e) => set("dueTime", e.target.value)}
                disabled={!form.dueDate}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <select
                value={form.priority}
                onChange={(e) => set("priority", Number(e.target.value))}
                className={SELECT_CLASS}
              >
                <option value={1}>Alta</option>
                <option value={0}>Normal</option>
                <option value={-1}>Baja</option>
              </select>
            </div>
          </div>
          {form.assignee === POOL && (
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as TaskType)}
                className={SELECT_CLASS}
              >
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Socio o lead (opcional)</Label>
            {person ? (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                <span>
                  {person.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    · {person.kind === "member" ? "Socio" : "Lead"}
                  </span>
                </span>
                <button type="button" onClick={() => setPerson(null)} aria-label="Quitar persona">
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <PersonPicker onPick={(p) => setPerson(p)} />
            )}
          </div>
          <div className="space-y-1">
            <Label>Notas</Label>
            <textarea
              value={form.detail}
              onChange={(e) => set("detail", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              placeholder="Contexto, qué se acordó, qué falta…"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creando…" : "Crear tarea"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
