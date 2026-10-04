"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addPersonToSegment, removeSegmentEntry, type PersonSegment, type SegmentOption } from "@/lib/actions/segment-lists";

type Auto = { key: string; title: string; emoji: string; color: string; description: string };

/**
 * "Segment memberships" de la ficha: en qué segmentos automáticos cae la
 * persona hoy (no se editan: los decide su asistencia y su membresía) y en
 * qué listas manuales está, con agregar/quitar y crear una lista ahí mismo.
 */
export function SegmentsCard({
  person,
  auto,
  lists,
  options,
}: {
  person: { kind: "lead" | "member"; id: string };
  auto: Auto[];
  lists: PersonSegment[];
  options: SegmentOption[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [pending, start] = useTransition();
  const inLists = new Set(lists.map((l) => l.segmentId));
  const available = options.filter((o) => !inLists.has(o.id));

  function add() {
    const target = choice === "__new" ? { newName } : choice ? { segmentId: choice } : null;
    if (!target) return;
    start(async () => {
      const res = await addPersonToSegment(person, target);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Agregado a la lista.");
      setAdding(false);
      setChoice("");
      setNewName("");
      router.refresh();
    });
  }

  function remove(entryId: string, name: string) {
    start(async () => {
      const res = await removeSegmentEntry(entryId, person);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Fuera de “${name}”.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {person.kind === "member" && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Automáticos (por asistencia y membresía)</p>
          {auto.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cae en ninguno hoy.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {auto.map((a) => (
                <Link
                  key={a.key}
                  href={`/dashboard/segmentos?segment=${a.key}`}
                  title={a.description}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80 ${a.color}`}
                >
                  <span aria-hidden>{a.emoji}</span> {a.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Listas</p>
        {lists.length === 0 ? (
          <p className="text-xs text-muted-foreground">No está en ninguna lista.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {lists.map((l) => (
              <span
                key={l.entryId}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2 pr-1 text-xs font-medium shadow-sm"
                title={`Agregado${l.addedBy ? ` por ${l.addedBy}` : ""}`}
              >
                <Link href={`/dashboard/segmentos?lista=${l.segmentId}`} className="hover:underline">
                  {l.name}
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(l.entryId, l.name)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Quitar de ${l.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {adding ? (
          <div className="mt-3 space-y-2 rounded-md border border-border p-2">
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              aria-label="Lista"
              autoFocus
            >
              <option value="">Elige una lista…</option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.count})
                </option>
              ))}
              <option value="__new">+ Nueva lista…</option>
            </select>
            {choice === "__new" && (
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
                placeholder="Nombre (ej: Convenio Banco X)"
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                autoFocus
              />
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button size="sm" onClick={add} disabled={pending || !choice || (choice === "__new" && !newName.trim())}>
                {pending ? "Guardando…" : "Agregar"}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="size-3.5" /> Agregar a una lista
          </button>
        )}
      </div>
    </div>
  );
}
