"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addMemberNote } from "@/lib/actions/notes";

type Note = {
  id: string;
  content: string;
  createdAt: Date;
  visibleToMember: boolean;
  author: { fullName: string } | null;
};

export function NotesTimeline({
  notes,
  memberId,
}: {
  notes: Note[];
  memberId: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [visibleToMember, setVisibleToMember] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    startTransition(async () => {
      await addMemberNote({ memberId, content: content.trim(), visibleToMember });
      toast.success(
        visibleToMember ? "Nota registrada y compartida con el socio." : "Nota registrada.",
      );
      setContent("");
      setVisibleToMember(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notas y comunicación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Agregar nota... (ej: 'Viaja 2 semanas, regresa el 15')"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={isPending || !content.trim()} size="sm">
              Agregar
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={visibleToMember}
              onChange={(e) => setVisibleToMember(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Visible para el socio (aparece en su app)
          </label>
        </form>

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin notas registradas.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="border-l-2 border-border pl-4 py-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{note.content}</p>
                  {note.visibleToMember && (
                    <Badge variant="outline" className="shrink-0 text-[10px] text-emerald-600 border-emerald-600/40">
                      Visible al socio
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(note.createdAt).toLocaleDateString("es-EC", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {note.author && ` — ${note.author.fullName}`}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
