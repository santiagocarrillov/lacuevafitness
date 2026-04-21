"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addMemberNote } from "@/lib/actions/notes";

type Note = {
  id: string;
  content: string;
  createdAt: Date;
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
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    startTransition(async () => {
      await addMemberNote({ memberId, content: content.trim() });
      toast.success("Nota registrada.");
      setContent("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notas y comunicación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="Agregar nota... (ej: 'Viaja 2 semanas, regresa el 15')"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={isPending || !content.trim()} size="sm">
            Agregar
          </Button>
        </form>

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin notas registradas.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="border-l-2 border-border pl-4 py-1">
                <p className="text-sm">{note.content}</p>
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
