"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { sendPushToMember } from "@/lib/actions/push";

export function MemberPushButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [open, setOpen] = useState(false);
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
          toast.warning("El socio no tiene notificaciones activas en ningún dispositivo.");
        } else {
          toast.success(`Enviado a ${res.sent} dispositivo(s).`);
          setOpen(false);
          setTitle("");
          setBody("");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al enviar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background text-sm font-medium h-9 px-3 hover:bg-accent transition">
        Notificar
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar notificación</DialogTitle>
          <DialogDescription>Push a los dispositivos de {memberName}.</DialogDescription>
        </DialogHeader>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Enviando…" : "Enviar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
