"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { recomputeChallenge } from "@/lib/actions/challenges";

export function RecalcButton({ challengeId }: { challengeId: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        start(async () => {
          try {
            await recomputeChallenge(challengeId);
            toast.success("Ranking recalculado.");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Error al recalcular.");
          }
        })
      }
      className="text-xs text-muted-foreground hover:text-foreground transition disabled:opacity-50"
    >
      {isPending ? "recalculando…" : "recalcular"}
    </button>
  );
}
