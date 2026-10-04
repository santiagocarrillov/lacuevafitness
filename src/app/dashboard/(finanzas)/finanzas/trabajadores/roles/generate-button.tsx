"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createPayrollRun } from "@/lib/actions/payroll";
import type { Sede } from "@/generated/prisma/enums";

export function GenerateRunButton({ sede, period, label }: { sede: Sede; period: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const { id } = await createPayrollRun(sede, period);
            router.push(`/dashboard/finanzas/trabajadores/roles/${id}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo generar.");
          }
        })
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#6b4fb5] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      <Plus className="size-4" /> {pending ? "Generando…" : label}
    </button>
  );
}
