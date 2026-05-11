"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { joinChallenge } from "@/lib/actions/portal";

export function JoinButton({ challengeId }: { challengeId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="portal-reto join-btn join-btn"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await joinChallenge(challengeId);
          if (result.ok) toast.success("¡Inscrito al reto!");
          else toast.error(result.error);
        });
      }}
      style={{
        marginTop: 10,
        width: "100%",
        padding: "9px 12px",
        background: "var(--pt-bg-dark)",
        color: "white",
        borderRadius: 10,
        border: 0,
        fontFamily: "var(--pt-font-mono)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        cursor: "pointer",
      }}
    >
      {pending ? "Inscribiendo…" : "Inscribirme"}
    </button>
  );
}
