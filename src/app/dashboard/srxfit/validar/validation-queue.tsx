"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rejectSelfEntry, verifySelfEntries } from "@/lib/actions/self-log";
import type { QueueItem } from "@/lib/self-log/queue";

const SEDE_SHORT: Record<string, string> = { FITNESS_CENTER: "Fitness", XTREME: "Xtreme" };

function when(iso: string) {
  return new Date(iso).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The queue itself. Cards leave the list as soon as they're tapped (and come
 * back with a toast if the server says no), so a coach can clear ten entries
 * in a few seconds between classes.
 */
export function ValidationQueue({ items, showSede }: { items: QueueItem[]; showSede: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [confirmReject, setConfirmReject] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const visible = items.filter((i) => !gone.has(i.id));
  const greens = visible.filter((i) => i.green);

  function hide(ids: string[], hidden: boolean) {
    setGone((prev) => {
      const next = new Set(prev);
      for (const id of ids) (hidden ? next.add(id) : next.delete(id));
      return next;
    });
  }

  function validate(list: QueueItem[]) {
    const ids = list.map((i) => i.id);
    hide(ids, true);
    setConfirmBulk(false);
    startTransition(async () => {
      const res = await verifySelfEntries(list.map((i) => ({ kind: i.kind, id: i.id })));
      if (!res.ok) {
        hide(ids, false);
        toast.error(res.error);
        return;
      }
      toast.success(res.count === 1 ? "Validado. Le avisamos al socio." : `${res.count} validados. Les avisamos a los socios.`);
      router.refresh();
    });
  }

  function reject(item: QueueItem) {
    hide([item.id], true);
    setConfirmReject(null);
    startTransition(async () => {
      const res = await rejectSelfEntry(item.kind, item.id);
      if (!res.ok) {
        hide([item.id], false);
        toast.error(res.error);
        return;
      }
      toast.success("Descartado. Le avisamos al socio.");
      router.refresh();
    });
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <p className="text-3xl">✅</p>
        <p className="mt-2 font-medium">Todo validado</p>
        <p className="text-sm text-muted-foreground">Cuando un socio registre algo desde su app, aparece aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b bg-background/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <p className="flex-1 text-sm">
          <span className="font-semibold">{visible.length}</span> por validar
          {greens.length > 0 && greens.length < visible.length && (
            <span className="text-muted-foreground">
              {" "}· {greens.length} en verde · {visible.length - greens.length} para revisar
            </span>
          )}
        </p>
        {greens.length > 0 &&
          (confirmBulk ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setConfirmBulk(false)}>
                No
              </Button>
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => validate(greens)}>
                Sí, validar {greens.length}
              </Button>
            </div>
          ) : (
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setConfirmBulk(true)}>
              <Check className="size-4" />
              Validar {greens.length === visible.length ? "todos" : `los ${greens.length} verdes`}
            </Button>
          ))}
      </div>

      {visible.map((item) => (
        <article
          key={item.id}
          className={`rounded-xl border bg-card p-4 shadow-sm ${item.green ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-amber-500"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/dashboard/socios/${item.memberId}`} className="font-medium hover:underline">
                {item.memberName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {when(item.at)}
                {showSede ? ` · ${SEDE_SHORT[item.sede] ?? item.sede}` : ""}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                item.green
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              }`}
            >
              {item.green ? "Normal" : "Revisar"}
            </span>
          </div>

          <div className="mt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.title}</p>
            {item.kind === "pr" ? (
              <p className="text-2xl font-semibold tabular-nums">{item.lines[0]}</p>
            ) : item.kind === "set" ? (
              <>
                <p className="text-2xl font-semibold tabular-nums">{item.lines[0]}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{item.lines[1]}</p>
              </>
            ) : (
              <ul className="mt-0.5 space-y-0.5 text-sm tabular-nums">
                {item.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
            <p className={`mt-1 text-sm ${item.green ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
              {item.note}
            </p>
            {item.reference && <p className="text-xs text-muted-foreground">{item.reference}</p>}
            {item.notes && <p className="mt-1 text-sm italic text-muted-foreground">“{item.notes}”</p>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {confirmReject === item.id ? (
              <>
                <Button variant="outline" className="h-11" onClick={() => setConfirmReject(null)}>
                  Cancelar
                </Button>
                <Button className="h-11 bg-red-600 text-white hover:bg-red-700" onClick={() => reject(item)}>
                  Sí, descartar
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="h-11 text-destructive hover:text-destructive"
                  onClick={() => setConfirmReject(item.id)}
                >
                  <X className="size-4" />
                  Descartar
                </Button>
                <Button className="h-11" onClick={() => validate([item])}>
                  <Check className="size-4" />
                  Validar
                </Button>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
