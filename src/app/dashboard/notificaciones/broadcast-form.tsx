"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendPushBroadcast } from "@/lib/actions/push";

type Audience = { total: number; fitness: number; xtreme: number };

export function BroadcastForm({ audience }: { audience: Audience }) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [sede, setSede] = useState<"" | "FITNESS_CENTER" | "XTREME">("");

  const target =
    sede === "FITNESS_CENTER" ? audience.fitness : sede === "XTREME" ? audience.xtreme : audience.total;

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Título y mensaje requeridos.");
      return;
    }
    if (target === 0) {
      toast.error("No hay socios suscritos en esa audiencia.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await sendPushBroadcast({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || undefined,
          sede: sede || null,
        });
        toast.success(`Enviado a ${res.sent} dispositivo(s).${res.failed ? ` ${res.failed} fallaron.` : ""}`);
        setTitle("");
        setBody("");
        setUrl("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al enviar.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nuevo mensaje</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={send} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Título</Label>
              <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="¡Nueva clase disponible!" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Audiencia</Label>
              <select
                value={sede}
                onChange={(e) => setSede(e.target.value as typeof sede)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm w-full"
              >
                <option value="">Todos ({audience.total})</option>
                <option value="FITNESS_CENTER">Fitness Center ({audience.fitness})</option>
                <option value="XTREME">Xtreme ({audience.xtreme})</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mensaje</Label>
            <textarea
              value={body}
              maxLength={160}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Escribe el aviso que verán los socios…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Abrir al tocar (opcional)</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/portal/nutricion" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Se enviará a {target} socio(s).</span>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
