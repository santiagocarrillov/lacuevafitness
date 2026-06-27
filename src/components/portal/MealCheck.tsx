"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logMeal } from "@/lib/actions/nutrition";

export function MealCheck({
  initialFollowed,
  initialFreeText,
}: {
  initialFollowed: boolean;
  initialFreeText: string | null;
}) {
  const router = useRouter();
  const [followed, setFollowed] = useState(initialFollowed);
  const [freeText, setFreeText] = useState(initialFreeText ?? "");
  const [isPending, startTransition] = useTransition();

  function persist(nextFollowed: boolean, nextFreeText: string) {
    startTransition(async () => {
      try {
        await logMeal({ followed: nextFollowed, freeText: nextFreeText || undefined });
        router.refresh();
      } catch {
        // revert optimistic check on failure
        setFollowed(initialFollowed);
      }
    });
  }

  function toggleFollowed() {
    const next = !followed;
    setFollowed(next);
    persist(next, freeText);
  }

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      <button
        type="button"
        onClick={toggleFollowed}
        disabled={isPending}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 14px",
          borderRadius: 10,
          border: `1px solid ${followed ? "var(--pt-green)" : "var(--pt-line)"}`,
          background: followed ? "var(--pt-green)" : "transparent",
          color: followed ? "#fff" : "var(--pt-ink-1)",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 999,
            border: `2px solid ${followed ? "#fff" : "var(--pt-ink-3)"}`,
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          {followed ? "✓" : ""}
        </span>
        {followed ? "Cumpliste tu plan hoy" : "Marcar que cumplí mi plan hoy"}
      </button>

      <textarea
        placeholder="¿Comiste algo distinto? Escríbelo aquí…"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        onBlur={() => {
          if ((freeText || "") !== (initialFreeText ?? "")) persist(followed, freeText);
        }}
        rows={2}
        style={{
          width: "100%",
          resize: "vertical",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--pt-line)",
          background: "var(--pt-bg-card)",
          color: "var(--pt-ink-1)",
          fontSize: 13,
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}
