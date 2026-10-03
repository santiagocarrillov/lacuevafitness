"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { assignPaymentToMembership } from "@/lib/actions/payments";

type Payment = {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  paidAt: Date | string | null;
  membershipId: string | null;
  depositorName: string | null;
  bankReference: string | null;
  bankEntity: string | null;
  notes: string | null;
};

type Membership = {
  id: string;
  priceCents: number;
  customPriceCents: number | null;
  startsAt: Date | string;
  endsAt: Date | string;
  state: string;
  planName: string;
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  STRIPE_CARD: "Tarjeta",
  PLUX_CARD: "TC Plux",
  STRIPE_LINK: "Link Stripe",
  OTHER: "Otro",
};

function fmt$(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC");
}

function daysSince(d: Date | string): number {
  const start = new Date(d).getTime();
  return Math.floor((Date.now() - start) / 86400000);
}

export function MembershipPaymentPanel({
  memberId,
  membership,
  payments,
  canEdit,
}: {
  memberId: string;
  membership: Membership;
  payments: Payment[];        // all payments for this member
  sede?: "FITNESS_CENTER" | "XTREME"; // the new payment page takes it from the member
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const here = `/dashboard/socios/${memberId}`;
  const editHref = (id: string) => `/dashboard/pagos/${id}?volver=${encodeURIComponent(here)}`;

  // Payments tied to this membership
  const linked = useMemo(
    () => payments.filter((p) => p.membershipId === membership.id),
    [payments, membership.id],
  );
  // The member's payments not linked to ANY membership (e.g. registered from the
  // general Payments section). Shown so the admin can attach them here.
  const unlinked = useMemo(
    () => payments.filter((p) => p.membershipId == null),
    [payments],
  );
  // Payments linked to a DIFFERENT membership — surfaced so the admin can re-point
  // one that landed on the wrong membership (e.g. after fixing a mis-assigned plan).
  const otherMembership = useMemo(
    () => payments.filter((p) => p.membershipId != null && p.membershipId !== membership.id),
    [payments, membership.id],
  );

  function handleAssignExisting(paymentId: string) {
    startTransition(async () => {
      try {
        await assignPaymentToMembership(paymentId, membership.id);
        toast.success("Pago asignado a esta membresía.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al asignar.");
      }
    });
  }
  const succeededTotal = linked.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amountCents, 0);
  const pendingTotal = linked.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amountCents, 0);
  const expectedCents = membership.customPriceCents ?? membership.priceCents;
  const remaining = expectedCents - succeededTotal;
  const daysOld = daysSince(membership.startsAt);
  const fullyPaid = succeededTotal >= expectedCents;
  const partial = !fullyPaid && succeededTotal > 0;
  const overdue = !fullyPaid && daysOld > 7 && succeededTotal === 0 && pendingTotal === 0;

  // ── Status badge ─────────────────────────────────────────────────
  let badge: { label: string; cls: string };
  if (fullyPaid) {
    badge = { label: "✓ Pagado", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  } else if (overdue) {
    badge = { label: `🚨 Sin pago (${daysOld}d)`, cls: "bg-red-50 text-red-800 border-red-200" };
  } else if (pendingTotal > 0) {
    badge = { label: "⏳ Pendiente (fondos sin verificar)", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  } else if (partial) {
    badge = { label: "💰 Pago parcial", cls: "bg-blue-50 text-blue-800 border-blue-200" };
  } else {
    badge = { label: `🕓 Sin pago aún (${daysOld}d)`, cls: "bg-zinc-50 text-zinc-700 border-zinc-200" };
  }

  return (
    <div className="space-y-2 border-t pt-3 mt-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Pago de esta membresía</p>
          <Badge variant="outline" className={`text-xs ${badge.cls}`}>{badge.label}</Badge>
        </div>
        {canEdit && !fullyPaid && (
          <Link
            href={`/dashboard/pagos/nuevo?socio=${memberId}&membresia=${membership.id}&volver=${encodeURIComponent(here)}`}
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium h-8 px-3 hover:opacity-90 transition"
          >
            + Registrar pago
          </Link>
        )}
      </div>

      {/* Member payments not yet linked to a membership */}
      {canEdit && unlinked.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5 space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-900">
            Pagos de este socio sin asignar a una membresía
          </p>
          <p className="text-[10px] text-muted-foreground">
            Se registraron desde la sección de Pagos. Asígnalos aquí para que cuenten en esta membresía (no vuelvas a registrarlos).
          </p>
          <div className="space-y-1">
            {unlinked.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium">{fmt$(p.amountCents)}</span>
                  <span className="text-muted-foreground truncate">
                    · {METHOD_LABELS[p.method] ?? p.method} · {fmtDate(p.paidAt)}
                    {p.status === "PENDING" && " · ⏳ pendiente"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={editHref(p.id)} className="text-xs text-muted-foreground hover:text-foreground">editar</Link>
                  <Button size="sm" variant="outline" disabled={isPending}
                    onClick={() => handleAssignExisting(p.id)}>
                    Asignar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payments sitting on a different membership — allow re-pointing */}
      {canEdit && otherMembership.length > 0 && (
        <details className="rounded-md border border-zinc-200 bg-zinc-50/50 p-2.5">
          <summary className="text-[11px] font-semibold text-zinc-700 cursor-pointer">
            ¿Un pago quedó en otra membresía? Tráelo aquí ({otherMembership.length})
          </summary>
          <div className="space-y-1 mt-2">
            {otherMembership.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium">{fmt$(p.amountCents)}</span>
                  <span className="text-muted-foreground truncate">
                    · {METHOD_LABELS[p.method] ?? p.method} · {fmtDate(p.paidAt)}
                    {p.status === "PENDING" && " · ⏳ pendiente"}
                  </span>
                </div>
                <Button size="sm" variant="outline" disabled={isPending}
                  onClick={() => {
                    if (!confirm("¿Mover este pago a esta membresía?")) return;
                    handleAssignExisting(p.id);
                  }}>
                  Traer aquí
                </Button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Linked payments list */}
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sin pagos registrados para esta membresía.</p>
      ) : (
        <div className="rounded-md border divide-y text-xs">
          {linked.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] ${
                  p.status === "SUCCEEDED" ? "text-emerald-700 border-emerald-200 bg-emerald-50"
                  : p.status === "PENDING" ? "text-amber-700 border-amber-200 bg-amber-50"
                  : "text-zinc-600 border-zinc-200"
                }`}>
                  {p.status === "SUCCEEDED" ? "✓" : p.status === "PENDING" ? "⏳" : p.status}
                </Badge>
                <span className="font-medium">{fmt$(p.amountCents)}</span>
                <span className="text-muted-foreground">· {METHOD_LABELS[p.method] ?? p.method}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{fmtDate(p.paidAt)}</span>
                {canEdit && <Link href={editHref(p.id)} className="text-xs text-muted-foreground hover:text-foreground">editar</Link>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Totals row */}
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">
          Pagado <strong className="text-emerald-700">{fmt$(succeededTotal)}</strong>
          {pendingTotal > 0 && <> · Pendiente <strong className="text-amber-700">{fmt$(pendingTotal)}</strong></>}
        </span>
        {!fullyPaid && (
          <span className="text-muted-foreground">Falta <strong>{fmt$(remaining)}</strong></span>
        )}
      </div>
    </div>
  );
}
