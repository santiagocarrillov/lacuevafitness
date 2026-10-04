"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archiveSegment, createSegment } from "@/lib/actions/segment-lists";

/** "+ Nueva lista": nombre y, opcional, para qué es. Las personas se agregan desde su ficha. */
export function NewListForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        + Nueva lista
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 rounded-lg border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createSegment({ name, description });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Lista creada. Agrega personas desde su ficha.");
          setOpen(false);
          setName("");
          setDescription("");
          router.push(`/dashboard/segmentos?lista=${res.data!.id}`);
        });
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Nombre
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Convenio Banco X"
          className="h-8 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>
      <label className="flex min-w-48 flex-[2] flex-col gap-1 text-xs text-muted-foreground">
        Para qué es (opcional)
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" disabled={pending || !name.trim()}>
        Crear
      </Button>
    </form>
  );
}

export function ArchiveListButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Archivar la lista “${name}”? Las personas no se tocan; la lista deja de aparecer.`)) return;
        start(async () => {
          const res = await archiveSegment(id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Lista archivada.");
          router.push("/dashboard/segmentos");
        });
      }}
    >
      Archivar lista
    </Button>
  );
}
