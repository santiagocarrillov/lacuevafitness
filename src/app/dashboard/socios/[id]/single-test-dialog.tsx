"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ecuadorDateString } from "@/lib/timezone";
import { createSingleTestResult } from "@/lib/actions/srxfit";

// Catalog of the SRXFit tests (key → label + unit). `isTime` inputs accept mm:ss.
const TEST_CATALOG: Array<{ key: string; label: string; unit: string; isTime?: boolean }> = [
  { key: "BACK_SQUAT_3RM", label: "Back Squat 3RM", unit: "kg" },
  { key: "DEADLIFT_3RM", label: "Deadlift 3RM", unit: "kg" },
  { key: "BENCH_PRESS_3RM", label: "Bench Press 3RM", unit: "kg" },
  { key: "PUSH_PRESS_3RM", label: "Push Press 3RM", unit: "kg" },
  { key: "CLEAN_JERK_1RM", label: "Clean & Jerk 1RM", unit: "kg" },
  { key: "SNATCH_1RM", label: "Snatch 1RM", unit: "kg" },
  { key: "PULL_UPS_MAX", label: "Pull-ups (máx)", unit: "reps" },
  { key: "RING_ROW_ANGLE", label: "Ring Row (ángulo)", unit: "grados" },
  { key: "DEAD_HANG_SECONDS", label: "Dead Hang", unit: "seg" },
  { key: "PLANK_SECONDS", label: "Plank", unit: "seg" },
  { key: "COOPER_METERS", label: "Cooper 12 min", unit: "metros" },
  { key: "CHRISTINE_TIME_SECONDS", label: "Christine (3 RFT)", unit: "seg", isTime: true },
  { key: "ROW_500M_SPRINT_SECONDS", label: "500m Remo Sprint", unit: "seg", isTime: true },
];

function timeToSeconds(val: string): number {
  if (!val.includes(":")) return parseFloat(val) || 0;
  const [mm, ss] = val.split(":").map(Number);
  return (mm || 0) * 60 + (ss || 0);
}

export function SingleTestDialog({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [testKey, setTestKey] = useState(TEST_CATALOG[0].key);
  const [value, setValue] = useState("");
  const [recordedAt, setRecordedAt] = useState(ecuadorDateString());
  const [notes, setNotes] = useState("");

  const meta = TEST_CATALOG.find((t) => t.key === testKey)!;

  function reset() {
    setTestKey(TEST_CATALOG[0].key);
    setValue("");
    setRecordedAt(ecuadorDateString());
    setNotes("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const numeric = meta.isTime ? timeToSeconds(value) : parseFloat(value);
    if (isNaN(numeric) || numeric <= 0) {
      toast.error("Ingresa un valor válido.");
      return;
    }
    startTransition(async () => {
      try {
        await createSingleTestResult({
          memberId,
          test: testKey as never,
          valueNumeric: numeric,
          unit: meta.unit,
          recordedAt,
          notes: notes.trim() || undefined,
        });
        toast.success("Test registrado.");
        setOpen(false);
        reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar el test.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger className="inline-flex items-center justify-center rounded-md border border-input text-sm font-medium h-8 px-3 hover:bg-accent transition">
        + Test individual
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar un test individual</DialogTitle>
          <DialogDescription>
            Para medir un solo movimiento sin hacer toda la batería (ej. un re-test cada 4 semanas).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Test</Label>
            <select
              value={testKey}
              onChange={(e) => setTestKey(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            >
              {TEST_CATALOG.map((t) => (
                <option key={t.key} value={t.key}>{t.label} ({t.unit})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor {meta.isTime ? "(mm:ss)" : `(${meta.unit})`}</Label>
              <Input
                type={meta.isTime ? "text" : "number"}
                step={meta.isTime ? undefined : "0.1"}
                min="0"
                placeholder={meta.isTime ? "mm:ss" : meta.unit}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha del test</Label>
              <Input type="date" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notas (opcional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ej: escalado a ring rows, molestia en hombro…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Registrar test"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
