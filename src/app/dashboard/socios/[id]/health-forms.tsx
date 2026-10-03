"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ecuadorDateString } from "@/lib/timezone";
import type { MenoStatus } from "@/lib/health-ranges";
import {
  recordBodyComp, updateBodyComp,
  recordClinicalMarker, updateClinicalMarker,
} from "@/lib/actions/health";

// Full-page forms for body composition and clinical labs (they used to be
// popups inside the ficha's Salud section).

export type BodyCompEdit = {
  id: string;
  measuredAt: Date | string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  muscleMassPct: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  basalMetabolism: number | null;
  notes: string | null;
};

export type ClinicalMarkerEdit = {
  id: string;
  measuredAt: Date | string;
  glucoseFasting: number | null;
  triglycerides: number | null;
  hdlCholesterol: number | null;
  hsCRP: number | null;
  testosteroneFree: number | null;
  estradiolE2: number | null;
  cycleDay: number | null;
  menopausalStatus: MenoStatus | null;
  notes: string | null;
};

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

// muscle %: prefer stored pct, else derive from kg / weight if both present
export function musclePct(bc: { muscleMassPct: number | null; muscleMassKg: number | null; weightKg: number | null }): number | null {
  if (bc.muscleMassPct != null) return bc.muscleMassPct;
  if (bc.muscleMassKg != null && bc.weightKg) return (bc.muscleMassKg / bc.weightKg) * 100;
  return null;
}

// Ecuador calendar day — the same on the server render and in the browser.
const dateInput = (d: Date | string) => ecuadorDateString(new Date(d));

// ─── Body composition (create + edit) ────────────────────────────────

type BCFields = {
  measuredAt: string;
  weightKg: string; heightCm: string; bodyFatPct: string;
  muscleMassPct: string; waistCm: string;
  hipCm: string; chestCm: string; armCm: string; thighCm: string;
  basalMetabolism: string; notes: string;
};

function emptyBCFields(): BCFields {
  return {
    measuredAt: ecuadorDateString(),
    weightKg: "", heightCm: "", bodyFatPct: "", muscleMassPct: "",
    waistCm: "", hipCm: "", chestCm: "", armCm: "", thighCm: "",
    basalMetabolism: "", notes: "",
  };
}

function bcToFields(bc: BodyCompEdit): BCFields {
  const mm = musclePct(bc);
  return {
    measuredAt: dateInput(bc.measuredAt),
    weightKg: bc.weightKg?.toString() ?? "",
    heightCm: bc.heightCm?.toString() ?? "",
    bodyFatPct: bc.bodyFatPct?.toString() ?? "",
    muscleMassPct: mm != null ? mm.toFixed(1) : "",
    waistCm: bc.waistCm?.toString() ?? "",
    hipCm: bc.hipCm?.toString() ?? "",
    chestCm: bc.chestCm?.toString() ?? "",
    armCm: bc.armCm?.toString() ?? "",
    thighCm: bc.thighCm?.toString() ?? "",
    basalMetabolism: bc.basalMetabolism?.toString() ?? "",
    notes: bc.notes ?? "",
  };
}

export function BodyCompForm({
  memberId, edit, backHref,
}: {
  memberId: string;
  edit: BodyCompEdit | null;
  backHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState<BCFields>(edit ? bcToFields(edit) : emptyBCFields());
  const set = (k: keyof BCFields, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          weightKg: num(f.weightKg),
          heightCm: num(f.heightCm),
          bodyFatPct: num(f.bodyFatPct),
          muscleMassPct: num(f.muscleMassPct),
          waistCm: num(f.waistCm),
          hipCm: num(f.hipCm),
          chestCm: num(f.chestCm),
          armCm: num(f.armCm),
          thighCm: num(f.thighCm),
          basalMetabolism: num(f.basalMetabolism) != null ? Math.round(num(f.basalMetabolism)!) : null,
          notes: f.notes,
          measuredAt: f.measuredAt,
        };
        if (edit) await updateBodyComp(edit.id, memberId, payload);
        else await recordBodyComp(memberId, payload);
        toast.success(edit ? "Medición actualizada." : "Medición guardada.");
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="space-y-1 col-span-2"><Label className="text-xs">Fecha</Label>
        <Input type="date" value={f.measuredAt} onChange={(e) => set("measuredAt", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Peso (kg)</Label>
        <Input type="number" step="0.1" value={f.weightKg} onChange={(e) => set("weightKg", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Altura (cm)</Label>
        <Input type="number" step="0.1" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">% Grasa</Label>
        <Input type="number" step="0.1" value={f.bodyFatPct} onChange={(e) => set("bodyFatPct", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">% Músculo</Label>
        <Input type="number" step="0.1" value={f.muscleMassPct} onChange={(e) => set("muscleMassPct", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Cintura (cm)</Label>
        <Input type="number" step="0.1" value={f.waistCm} onChange={(e) => set("waistCm", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Cadera (cm)</Label>
        <Input type="number" step="0.1" value={f.hipCm} onChange={(e) => set("hipCm", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Pecho (cm)</Label>
        <Input type="number" step="0.1" value={f.chestCm} onChange={(e) => set("chestCm", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Brazo (cm)</Label>
        <Input type="number" step="0.1" value={f.armCm} onChange={(e) => set("armCm", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Muslo (cm)</Label>
        <Input type="number" step="0.1" value={f.thighCm} onChange={(e) => set("thighCm", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Met. basal (kcal)</Label>
        <Input type="number" value={f.basalMetabolism} onChange={(e) => set("basalMetabolism", e.target.value)} /></div>
      <div className="space-y-1 col-span-2"><Label className="text-xs">Notas</Label>
        <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      <div className="col-span-2 flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : edit ? "Guardar cambios" : "Guardar medición"}
        </Button>
      </div>
    </form>
  );
}

// ─── Clinical markers (create + edit) ────────────────────────────────

type CMFields = {
  measuredAt: string;
  glucoseFasting: string; triglycerides: string; hdlCholesterol: string; hsCRP: string;
  testosteroneFree: string; estradiolE2: string; cycleDay: string;
  menopausalStatus: "" | MenoStatus; notes: string;
};

function emptyCMFields(): CMFields {
  return {
    measuredAt: ecuadorDateString(),
    glucoseFasting: "", triglycerides: "", hdlCholesterol: "", hsCRP: "",
    testosteroneFree: "", estradiolE2: "", cycleDay: "",
    menopausalStatus: "", notes: "",
  };
}

function cmToFields(cm: ClinicalMarkerEdit): CMFields {
  return {
    measuredAt: dateInput(cm.measuredAt),
    glucoseFasting: cm.glucoseFasting?.toString() ?? "",
    triglycerides: cm.triglycerides?.toString() ?? "",
    hdlCholesterol: cm.hdlCholesterol?.toString() ?? "",
    hsCRP: cm.hsCRP?.toString() ?? "",
    testosteroneFree: cm.testosteroneFree?.toString() ?? "",
    estradiolE2: cm.estradiolE2?.toString() ?? "",
    cycleDay: cm.cycleDay?.toString() ?? "",
    menopausalStatus: cm.menopausalStatus ?? "",
    notes: cm.notes ?? "",
  };
}

export function ClinicalMarkerForm({
  memberId, edit, backHref,
}: {
  memberId: string;
  edit: ClinicalMarkerEdit | null;
  backHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [f, setF] = useState<CMFields>(edit ? cmToFields(edit) : emptyCMFields());
  const set = (k: keyof CMFields, v: string) => setF((p) => ({ ...p, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const payload = {
          glucoseFasting: num(f.glucoseFasting),
          triglycerides: num(f.triglycerides),
          hdlCholesterol: num(f.hdlCholesterol),
          hsCRP: num(f.hsCRP),
          testosteroneFree: num(f.testosteroneFree),
          estradiolE2: num(f.estradiolE2),
          cycleDay: num(f.cycleDay) != null ? Math.round(num(f.cycleDay)!) : null,
          menopausalStatus: (f.menopausalStatus || null) as MenoStatus | null,
          notes: f.notes,
          measuredAt: f.measuredAt,
        };
        if (edit) await updateClinicalMarker(edit.id, memberId, payload);
        else await recordClinicalMarker(memberId, payload);
        toast.success(edit ? "Marcadores actualizados." : "Marcadores guardados.");
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div className="space-y-1 col-span-2 sm:col-span-3"><Label className="text-xs">Fecha</Label>
        <Input type="date" value={f.measuredAt} onChange={(e) => set("measuredAt", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Glucosa (mg/dL)</Label>
        <Input type="number" step="0.1" value={f.glucoseFasting} onChange={(e) => set("glucoseFasting", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Triglicéridos (mg/dL)</Label>
        <Input type="number" step="0.1" value={f.triglycerides} onChange={(e) => set("triglycerides", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">HDL (mg/dL)</Label>
        <Input type="number" step="0.1" value={f.hdlCholesterol} onChange={(e) => set("hdlCholesterol", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">PCR-us (mg/L)</Label>
        <Input type="number" step="0.01" value={f.hsCRP} onChange={(e) => set("hsCRP", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Testosterona libre (ng/dL)</Label>
        <Input type="number" step="0.1" value={f.testosteroneFree} onChange={(e) => set("testosteroneFree", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Estradiol E2 (pg/mL)</Label>
        <Input type="number" step="0.1" value={f.estradiolE2} onChange={(e) => set("estradiolE2", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Día del ciclo (1-28)</Label>
        <Input type="number" value={f.cycleDay} onChange={(e) => set("cycleDay", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Estado menopáusico</Label>
        <select value={f.menopausalStatus} onChange={(e) => set("menopausalStatus", e.target.value as MenoStatus | "")}
          className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">—</option>
          <option value="PRE">Premenopausia</option>
          <option value="PERI">Perimenopausia</option>
          <option value="POST">Posmenopausia</option>
        </select>
      </div>
      <div className="space-y-1 col-span-2 sm:col-span-3"><Label className="text-xs">Notas</Label>
        <Input value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      <div className="col-span-2 sm:col-span-3 flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : edit ? "Guardar cambios" : "Guardar marcadores"}
        </Button>
      </div>
    </form>
  );
}
