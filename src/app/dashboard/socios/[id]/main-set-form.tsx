"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordMainSetForMember } from "@/lib/actions/srxfit";

const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v));

/** Full-page "registrar la serie principal" a coach fills for the socio. */
export function MainSetForm({
  memberId,
  backHref,
  today,
  suggestedExercise,
}: {
  memberId: string;
  backHref: string;
  /** Ecuador day, yyyy-mm-dd. */
  today: string;
  suggestedExercise: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [exercise, setExercise] = useState(suggestedExercise ?? "");
  const [loadKg, setLoadKg] = useState("");
  const [reps, setReps] = useState("");
  const [rir, setRir] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const res = await recordMainSetForMember({ memberId, exercise, loadKg: num(loadKg), reps: num(reps), rir: num(rir), date, notes });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Serie registrada.");
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar la serie.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Ejercicio principal</Label>
        <Input value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="ej: Back Squat" maxLength={80} required />
        {suggestedExercise && <p className="text-xs text-muted-foreground">El de la rutina de hoy: {suggestedExercise}.</p>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Carga (kg)</Label>
          <Input type="number" inputMode="decimal" step="0.5" min="1" value={loadKg} onChange={(e) => setLoadKg(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Repeticiones</Label>
          <Input type="number" inputMode="numeric" step="1" min="1" value={reps} onChange={(e) => setReps(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">En reserva</Label>
          <Input type="number" inputMode="numeric" step="1" min="0" max="6" value={rir} onChange={(e) => setRir(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Fecha</Label>
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
        <p className="text-xs text-muted-foreground">Una serie por día: si ya había una en esa fecha, esta la reemplaza.</p>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notas (opcional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="ej: con pausa, molestia en hombro…" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Registrar serie"}
        </Button>
      </div>
    </form>
  );
}
