"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addClinicalRecord, deleteClinicalRecord } from "@/lib/actions/clinical-records";

type ClinicalRecord = {
  id: string;
  content: string;
  createdAt: Date;
  authoredBy: { fullName: string } | null;
};

export function ClinicalRecordsSection({
  memberId,
  records,
}: {
  memberId: string;
  records: ClinicalRecord[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    startTransition(async () => {
      try {
        await addClinicalRecord({ memberId, content: content.trim() });
        toast.success("Registro clínico guardado.");
        setContent("");
        router.refresh();
      } catch {
        toast.error("No se pudo guardar.");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteClinicalRecord(id, memberId);
        toast.success("Registro eliminado.");
        router.refresh();
      } catch {
        toast.error("No se pudo eliminar.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historia clínica</CardTitle>
        <CardDescription>
          Anamnesis, patologías, medicación, restricciones. Privado — nunca visible para el socio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="space-y-2">
          <textarea
            placeholder="Anotación clínica privada…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isPending || !content.trim()}>
              Guardar registro
            </Button>
          </div>
        </form>

        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin historia clínica registrada.</p>
        ) : (
          <div className="space-y-3">
            {records.map((rec) => (
              <div key={rec.id} className="border-l-2 border-border pl-4 py-1 group">
                <p className="text-sm whitespace-pre-wrap">{rec.content}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(rec.createdAt).toLocaleDateString("es-EC", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {rec.authoredBy && ` — ${rec.authoredBy.fullName}`}
                  </p>
                  <button
                    onClick={() => handleDelete(rec.id)}
                    disabled={isPending}
                    className="text-xs text-destructive opacity-0 group-hover:opacity-100 transition"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
