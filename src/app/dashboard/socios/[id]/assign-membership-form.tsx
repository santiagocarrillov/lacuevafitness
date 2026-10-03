"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { assignMembership } from "@/lib/actions/members";

type Plan = { id: string; name: string; priceCents: number; durationDays: number };

/** Full-page "asignar membresía": one click on a plan assigns it (was a popup). */
export function AssignMembershipForm({
  memberId,
  plans,
  backHref,
}: {
  memberId: string;
  plans: Plan[]; // already filtered by the member's sede
  backHref: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleAssignPlan(planId: string) {
    startTransition(async () => {
      try {
        await assignMembership({ memberId, planId });
        toast.success("Membresía asignada.");
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo asignar la membresía.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay planes activos para la sede de este socio.</p>
      ) : (
        <div className="space-y-2">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleAssignPlan(p.id)}
              disabled={isPending}
              className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-accent transition text-sm text-left disabled:opacity-60"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground">
                ${(p.priceCents / 100).toFixed(2)} · {p.durationDays}d
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-end pt-1">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
