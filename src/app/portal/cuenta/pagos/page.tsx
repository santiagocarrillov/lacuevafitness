import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { money, shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  SUCCEEDED: "Confirmado",
  FAILED: "Fallido",
  REFUNDED: "Reembolsado",
};

export default async function PagosPage() {
  const { member } = await requireMember();
  const payments = await prisma.payment.findMany({
    where: { memberId: member.id },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  const initial = member.firstName.charAt(0).toUpperCase();

  return (
    <PortalShell avatarInitial={initial}>
      <Link
        href="/portal/cuenta"
        style={{ fontSize: 11, color: "var(--pt-ink-3)", textDecoration: "none" }}
      >
        ← Mi cuenta
      </Link>
      <div style={{ margin: "12px 0 18px" }}>
        <div className="portal-kicker">{payments.length} registros</div>
        <h2 className="portal-title">
          Tus <em>pagos</em>
        </h2>
      </div>
      {payments.length === 0 ? (
        <div className="portal-card">
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
            Aún no tienes pagos registrados a tu nombre.
          </p>
        </div>
      ) : (
        payments.map((p) => (
          <div key={p.id} className="portal-list-item" style={{ alignItems: "flex-start" }}>
            <div className="li-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </div>
            <div className="info">
              <div className="t">
                {money(p.amountCents, p.currency)} · {p.method}
              </div>
              <div className="s">
                {shortDate(p.paidAt ?? p.createdAt)} · {STATUS_LABEL[p.status] ?? p.status}
                {p.bankReference ? ` · Ref ${p.bankReference}` : ""}
              </div>
            </div>
          </div>
        ))
      )}
    </PortalShell>
  );
}
