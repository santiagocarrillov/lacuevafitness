import Link from "next/link";

const H24 = 24 * 60 * 60 * 1000;

function ago(d: Date, now: Date) {
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/**
 * El hilo de WhatsApp de la persona, resumido: cuándo escribió, cuándo le
 * respondimos y si la ventana de 24h sigue abierta. Fuera de ella solo entra
 * una plantilla — mejor saberlo antes de abrir el inbox.
 */
export function WhatsappSummary({
  conversation,
  fallback,
}: {
  conversation: { id: string; lastInboundAt: Date | null; lastOutboundAt: Date | null } | null;
  fallback?: React.ReactNode;
}) {
  if (!conversation) return <>{fallback ?? <p className="text-xs text-muted-foreground">Sin conversación de WhatsApp.</p>}</>;
  const now = new Date();
  const open = conversation.lastInboundAt != null && now.getTime() - conversation.lastInboundAt.getTime() < H24;
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${open ? "bg-emerald-500" : "bg-muted-foreground/40"}`} aria-hidden />
        {open ? "Ventana de 24h abierta" : "Fuera de la ventana de 24h (solo plantilla)"}
      </p>
      <dl className="space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Escribió</dt>
          <dd>{conversation.lastInboundAt ? ago(conversation.lastInboundAt, now) : "--"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Le escribimos</dt>
          <dd>{conversation.lastOutboundAt ? ago(conversation.lastOutboundAt, now) : "--"}</dd>
        </div>
      </dl>
      <Link href={`/dashboard/comunicacion?c=${conversation.id}`} className="inline-block text-xs font-medium text-primary hover:underline">
        Abrir conversación →
      </Link>
    </div>
  );
}
