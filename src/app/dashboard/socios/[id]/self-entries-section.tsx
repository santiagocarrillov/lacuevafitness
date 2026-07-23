"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verifySelfEntry, rejectSelfEntry } from "@/lib/actions/self-log";

export type SelfEntry = {
  id: string;
  kind: "measurement" | "pr";
  at: string;
  /** Human summary, e.g. "Peso 74.5 kg · Cintura 82 cm" or "Bench press (3RM) 100 kg" */
  summary: string;
  notes: string | null;
  verified: boolean;
};

/**
 * Self-reported entries a socio logged from their app. Unverified ones are
 * flagged amber and don't count toward reports or challenge rankings until a
 * coach validates them here.
 */
export function SelfEntriesSection({
  memberId,
  entries,
  canValidate,
}: {
  memberId: string;
  entries: SelfEntry[];
  canValidate: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (entries.length === 0) return null;

  const pending = entries.filter((e) => !e.verified);

  function act(kind: "verify" | "reject", entry: SelfEntry) {
    setBusyId(entry.id);
    startTransition(async () => {
      const res =
        kind === "verify"
          ? await verifySelfEntry(entry.kind, entry.id, memberId)
          : await rejectSelfEntry(entry.kind, entry.id, memberId);
      setBusyId(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(kind === "verify" ? "Registro validado." : "Registro descartado.");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-heading text-lg font-semibold uppercase tracking-wide">
          Registros del socio
        </h2>
        {pending.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <span className="size-1.5 rounded-full bg-amber-500" />
            {pending.length} sin validar
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Datos que el socio ingresó desde su app. No cuentan para reportes ni retos
        hasta que los valides.
      </p>

      <div className="rounded-lg border border-border divide-y divide-border">
        {entries.map((e) => (
          <div key={e.id} className="flex items-start gap-3 p-3 flex-wrap">
            <span
              className={`mt-1.5 size-2 shrink-0 rounded-full ${
                e.verified ? "bg-emerald-500" : "bg-amber-500"
              }`}
              aria-hidden
            />
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-medium">{e.summary}</p>
              <p className="text-xs text-muted-foreground">
                {e.at}
                {e.verified ? " · validado" : " · registrado por el socio, sin validar"}
                {e.notes ? ` · “${e.notes}”` : ""}
              </p>
            </div>
            {canValidate && !e.verified && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => act("verify", e)}
                  disabled={isPending && busyId === e.id}
                >
                  Validar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => act("reject", e)}
                  disabled={isPending && busyId === e.id}
                >
                  Descartar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
