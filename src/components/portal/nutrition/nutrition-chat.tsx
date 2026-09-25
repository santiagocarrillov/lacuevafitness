"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markStaffMessagesRead, sendNutritionMessage } from "@/lib/actions/nutrition-messages";

export type ChatMessage = {
  id: string;
  author: "MEMBER" | "STAFF";
  body: string;
  createdAt: string; // ISO
  mealLabel: string | null;
};

function when(iso: string) {
  return new Date(iso).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Socio ↔ nutritionist thread. Opening it marks her replies as read. */
export function NutritionChat({ messages, staffName }: { messages: ChatMessage[]; staffName: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (messages.some((m) => m.author === "STAFF")) markStaffMessagesRead().catch(() => undefined);
  }, [messages]);

  function send() {
    startTransition(async () => {
      try {
        await sendNutritionMessage({ body });
        setBody("");
        setError(null);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar.");
      }
    });
  }

  return (
    <div>
      {messages.length === 0 ? (
        <div className="portal-card" style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 14, color: "var(--pt-ink-2)", margin: 0 }}>
            Escríbele a {staffName} lo que quieras sobre tu plan: qué te costó, qué cambiaste, dudas. Te responde aquí mismo.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {messages.map((m) => {
            const mine = m.author === "MEMBER";
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: 14,
                    background: mine ? "var(--pt-ink)" : "var(--pt-bg-card)",
                    color: mine ? "#fff" : "var(--pt-ink)",
                    border: mine ? "none" : "1px solid var(--pt-line)",
                  }}
                >
                  {m.mealLabel && (
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7, marginBottom: 2 }}>
                      Sobre {m.mealLabel.toLowerCase()}
                    </div>
                  )}
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.body}</div>
                  <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: "right" }}>
                    {mine ? "Tú" : staffName} · {when(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe a tu nutricionista…"
          style={{ width: "100%", borderRadius: 12, border: "1px solid var(--pt-line)", padding: 10, fontSize: 14, fontFamily: "inherit" }}
        />
        {error && <p style={{ color: "var(--pt-red)", fontSize: 12, margin: 0 }}>{error}</p>}
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={send}
          style={{
            padding: "11px 14px",
            borderRadius: 12,
            border: "none",
            background: "var(--pt-ink)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            opacity: pending || !body.trim() ? 0.5 : 1,
            cursor: "pointer",
          }}
        >
          {pending ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
