"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createNutritionTip,
  updateNutritionTip,
  setNutritionTipActive,
} from "@/lib/actions/nutrition";

type Sede = "FITNESS_CENTER" | "XTREME";
type Tip = {
  id: string;
  title: string;
  body: string;
  sede: Sede | null;
  active: boolean;
};

const SEDE_LABEL: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

function SedeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">Ambas sedes</option>
      <option value="FITNESS_CENTER">Fitness Center</option>
      <option value="XTREME">Xtreme</option>
    </select>
  );
}

export function TipsManager({ tips }: { tips: Tip[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nt, setNt] = useState({ title: "", body: "", sede: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", body: "", sede: "" });

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!nt.title.trim() || !nt.body.trim()) {
      toast.error("Título y contenido requeridos.");
      return;
    }
    startTransition(async () => {
      try {
        await createNutritionTip({
          title: nt.title,
          body: nt.body,
          sede: (nt.sede || null) as Sede | null,
        });
        toast.success("Cápsula creada.");
        setNt({ title: "", body: "", sede: "" });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al crear.");
      }
    });
  }

  function startEdit(t: Tip) {
    setEditId(t.id);
    setEdit({ title: t.title, body: t.body, sede: t.sede ?? "" });
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      try {
        await updateNutritionTip(id, {
          title: edit.title,
          body: edit.body,
          sede: (edit.sede || null) as Sede | null,
        });
        toast.success("Cápsula actualizada.");
        setEditId(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al guardar.");
      }
    });
  }

  function toggleActive(t: Tip) {
    startTransition(async () => {
      try {
        await setNutritionTipActive(t.id, !t.active);
        toast.success(t.active ? "Cápsula archivada." : "Cápsula reactivada.");
        router.refresh();
      } catch {
        toast.error("No se pudo actualizar.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Create */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva cápsula</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Título</Label>
                <Input
                  value={nt.title}
                  onChange={(e) => setNt((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Hidratación en días de calor"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sede</Label>
                <SedeSelect value={nt.sede} onChange={(v) => setNt((p) => ({ ...p, sede: v }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contenido</Label>
              <textarea
                value={nt.body}
                onChange={(e) => setNt((p) => ({ ...p, body: e.target.value }))}
                rows={3}
                placeholder="Escribe el consejo tal como lo verá el socio…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={isPending}>
                Crear cápsula
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-2">
        {tips.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay cápsulas.</p>
        ) : (
          tips.map((t) => (
            <div key={t.id} className="rounded-md border p-3 text-sm space-y-2">
              {editId === t.id ? (
                <div className="space-y-2">
                  <Input
                    value={edit.title}
                    onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))}
                  />
                  <textarea
                    value={edit.body}
                    onChange={(e) => setEdit((p) => ({ ...p, body: e.target.value }))}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <SedeSelect value={edit.sede} onChange={(v) => setEdit((p) => ({ ...p, sede: v }))} />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditId(null)} disabled={isPending}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(t.id)} disabled={isPending}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{t.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {t.sede ? SEDE_LABEL[t.sede] : "Ambas"}
                        </Badge>
                        {!t.active && <Badge variant="outline" className="text-[10px]">Archivada</Badge>}
                      </div>
                      <p className="text-muted-foreground whitespace-pre-wrap mt-1">{t.body}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(t)} disabled={isPending}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(t)} disabled={isPending}>
                        {t.active ? "Archivar" : "Reactivar"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
