"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { openMemberConversation } from "@/lib/actions/comunicacion";

/**
 * "WhatsApp" de la ficha de un socio que todavía no tiene hilo: lo abre (sin
 * mandar nada) y lleva al inbox, donde se escribe como siempre.
 */
export function WriteWhatsappButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await openMemberConversation(memberId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          router.push(`/dashboard/comunicacion?c=${res.conversationId}`);
        })
      }
      className="group flex min-w-0 flex-col items-center gap-1 text-[10.5px] font-medium text-muted-foreground disabled:opacity-50"
    >
      <span className="flex size-8 items-center justify-center rounded-full border border-border bg-background text-foreground transition group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
        <MessageCircle className="size-4" />
      </span>
      WhatsApp
    </button>
  );
}
