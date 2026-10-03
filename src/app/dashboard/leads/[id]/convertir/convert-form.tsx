"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { convertLeadToMember } from "@/lib/actions/leads";

type Plan = { id: string; name: string; priceCents: number; durationDays: number };

export function ConvertForm({ leadId, plans, backHref }: { leadId: string; plans: Plan[]; backHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function convert(planId: string) {
    start(async () => {
      try {
        const member = await convertLeadToMember(leadId, planId);
        toast.success(`${member.firstName} ya es socio.`);
        router.push(`/dashboard/socios/${member.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo convertir.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {plans.length === 0 && <p className="text-sm text-muted-foreground">No hay planes activos para esta sede.</p>}
      {plans.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => convert(p.id)}
          disabled={pending}
          className="flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition hover:bg-accent disabled:opacity-60"
        >
          <span className="font-medium">{p.name}</span>
          <span className="text-muted-foreground">
            ${(p.priceCents / 100).toFixed(2)} · {p.durationDays} días
          </span>
        </button>
      ))}
      <div className="flex justify-end pt-2">
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
