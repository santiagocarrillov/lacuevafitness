"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type BodyComp = {
  id: string;
  measuredAt: Date;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  waterPct: number | null;
  basalMetabolism: number | null;
  notes: string | null;
};

export function BodyCompSection({
  bodyComps,
  memberId,
}: {
  bodyComps: BodyComp[];
  memberId: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    weightKg: "", heightCm: "", bodyFatPct: "", muscleMassKg: "", waterPct: "", basalMetabolism: "", notes: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/body-comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, ...form }),
      });
      if (res.ok) {
        toast.success("Composición corporal registrada.");
        setShowForm(false);
        setForm({ weightKg: "", heightCm: "", bodyFatPct: "", muscleMassKg: "", waterPct: "", basalMetabolism: "", notes: "" });
        router.refresh();
      }
    });
  }

  const latest = bodyComps[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Composición corporal</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "+ Registrar medición"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4 border-b">
            <div className="space-y-1">
              <Label className="text-xs">Peso (kg)</Label>
              <Input type="number" step="0.1" value={form.weightKg} onChange={(e) => update("weightKg", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura (cm)</Label>
              <Input type="number" step="0.1" value={form.heightCm} onChange={(e) => update("heightCm", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">% Grasa</Label>
              <Input type="number" step="0.1" value={form.bodyFatPct} onChange={(e) => update("bodyFatPct", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Masa muscular (kg)</Label>
              <Input type="number" step="0.1" value={form.muscleMassKg} onChange={(e) => update("muscleMassKg", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">% Agua</Label>
              <Input type="number" step="0.1" value={form.waterPct} onChange={(e) => update("waterPct", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Metabolismo basal</Label>
              <Input type="number" value={form.basalMetabolism} onChange={(e) => update("basalMetabolism", e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Notas</Label>
              <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} />
            </div>
            <Button type="submit" disabled={isPending} className="col-span-2 sm:col-span-4">
              Guardar medición
            </Button>
          </form>
        )}

        {bodyComps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin mediciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {bodyComps.map((bc, i) => (
              <div key={bc.id} className="flex flex-wrap gap-3 text-sm py-2 border-b last:border-0">
                <Badge variant="outline" className="text-xs">
                  {new Date(bc.measuredAt).toLocaleDateString("es-EC")}
                </Badge>
                {bc.weightKg && <span>Peso: <strong>{bc.weightKg} kg</strong></span>}
                {bc.bodyFatPct && <span>Grasa: <strong>{bc.bodyFatPct}%</strong></span>}
                {bc.muscleMassKg && <span>Músculo: <strong>{bc.muscleMassKg} kg</strong></span>}
                {bc.waterPct && <span>Agua: <strong>{bc.waterPct}%</strong></span>}
                {bc.basalMetabolism && <span>MB: <strong>{bc.basalMetabolism} kcal</strong></span>}
                {bc.notes && <span className="text-muted-foreground italic">{bc.notes}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
