import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, SriEnvironment } from "@/generated/prisma/enums";

const LABELS: Record<InvoiceStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Borrador", variant: "outline" },
  SENT: { label: "En el SRI", variant: "secondary" },
  AUTHORIZED: { label: "Autorizada", variant: "default" },
  REJECTED: { label: "Rechazada", variant: "destructive" },
  VOIDED: { label: "Anulada", variant: "outline" },
};

export function StatusBadge({ status, environment }: { status: InvoiceStatus; environment: SriEnvironment }) {
  const s = LABELS[status];
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={s.variant}>{s.label}</Badge>
      {environment === "PRUEBAS" && status !== "VOIDED" && <Badge variant="outline">pruebas</Badge>}
    </span>
  );
}
