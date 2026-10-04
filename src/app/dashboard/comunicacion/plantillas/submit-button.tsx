"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitTemplate } from "@/lib/actions/whatsapp-templates";

export function SubmitTemplateButton({ name }: { name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const status = await submitTemplate(name);
            toast.success(status === "APPROVED" ? "Aprobada por Meta." : "Enviada: Meta la está revisando.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "No se pudo enviar.");
          }
        })
      }
    >
      {pending ? "Enviando…" : "Enviar a Meta"}
    </Button>
  );
}
