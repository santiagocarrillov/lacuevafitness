"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPushToMember } from "@/lib/actions/push";

/** Full-page "enviar notificación" to one socio's devices (used to be a popup). */
export function MemberPushForm({ memberId, backHref }: { memberId: string; backHref: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Título y mensaje requeridos.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await sendPushToMember(memberId, { title: title.trim(), body: body.trim() });
        if (res.sent === 0) {
          // Stay on the screen: nothing was delivered.
          toast.warning("El socio no tiene notificaciones activas en ningún dispositivo.");
        } else {
          toast.success(`Enviado a ${res.sent} dispositivo(s).`);
          router.push(backHref);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al enviar.");
      }
    });
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Título</Label>
        <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Mensaje</Label>
        <textarea
          value={body}
          maxLength={160}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Enviando…" : "Enviar"}</Button>
      </div>
    </form>
  );
}
