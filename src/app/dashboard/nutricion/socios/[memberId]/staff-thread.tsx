"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markMemberMessagesRead, replyNutritionMessage } from "@/lib/actions/nutrition-messages";

type Msg = { id: string; author: "MEMBER" | "STAFF"; body: string; createdAt: string; mealLabel: string | null; unread: boolean };

export function StaffThread({ memberId, memberFirstName, messages }: { memberId: string; memberFirstName: string; messages: Msg[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const hasUnread = messages.some((m) => m.unread);

  useEffect(() => {
    if (hasUnread) markMemberMessagesRead(memberId).catch(() => undefined);
  }, [hasUnread, memberId]);

  function send() {
    startTransition(async () => {
      try {
        await replyNutritionMessage(memberId, body);
        setBody("");
        toast.success(`Enviado. A ${memberFirstName} le llega un aviso.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo enviar.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[28rem] overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 && <p className="text-sm text-muted-foreground">Sin mensajes todavía.</p>}
        {messages.map((m) => {
          const staff = m.author === "STAFF";
          return (
            <div key={m.id} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  staff ? "bg-primary text-primary-foreground" : "bg-muted"
                } ${m.unread ? "ring-2 ring-amber-400" : ""}`}
              >
                {m.mealLabel && <p className="text-[10px] uppercase opacity-70">Sobre {m.mealLabel.toLowerCase()}</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-right text-[10px] opacity-60">
                  {staff ? "Tú" : memberFirstName} ·{" "}
                  {new Date(m.createdAt).toLocaleString("es-EC", {
                    timeZone: "America/Guayaquil",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={`Responder a ${memberFirstName}…`}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end">
        <Button disabled={pending || !body.trim()} onClick={send}>
          {pending ? "Enviando…" : "Responder"}
        </Button>
      </div>
    </div>
  );
}
