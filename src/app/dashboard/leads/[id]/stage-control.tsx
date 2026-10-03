"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateLeadStage } from "@/lib/actions/leads";
import { LEAD_STAGES, MEMBER_OWNED_STAGES, STAGE_COLOR, STAGE_LABEL } from "@/lib/leads/stages";
import type { LeadStage } from "@/generated/prisma/client";

/**
 * La etapa del embudo, editable mientras la persona no sea socia. "Socio
 * activo" y "En evaluación" no se eligen: las pone el plan que se registra al
 * convertir (pagar los $9 no es ser socio activo).
 */
export function StageControl({ leadId, stage }: { leadId: string; stage: LeadStage }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const options = LEAD_STAGES.filter((s) => !MEMBER_OWNED_STAGES.includes(s) || s === stage);

  return (
    <div className="space-y-3">
      <select
        value={stage}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as LeadStage;
          start(async () => {
            try {
              await updateLeadStage(leadId, next);
              toast.success(`Etapa: ${STAGE_LABEL[next]}`);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "No se pudo cambiar la etapa.");
            }
          });
        }}
        className={`h-9 w-full rounded-md border px-2 text-sm font-medium ${STAGE_COLOR[stage]}`}
        aria-label="Etapa del embudo"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <Link
        href={`/dashboard/leads/${leadId}/convertir`}
        className="inline-flex h-8 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Convertir a socio
      </Link>
    </div>
  );
}
