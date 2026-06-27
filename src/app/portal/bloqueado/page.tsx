import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { portalSignOut } from "@/lib/actions/portal-auth";
import { shortDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

export default async function PortalBlockedPage() {
  // Opt out of the access gate here — this IS the wall, redirecting would loop.
  const { member, access, isStaff } = await requireMember({ enforceAccess: false });

  // If they're actually allowed (or staff previewing), don't strand them on the wall.
  if (isStaff || access.state !== "blocked") redirect("/portal/hoy");

  const reason =
    member.status === "CHURNED"
      ? "Tu membresía fue dada de baja."
      : member.status === "PAUSED"
        ? "Tu membresía está congelada."
        : access.endsAt
          ? `Tu membresía venció el ${shortDate(access.endsAt)}.`
          : "No tienes una membresía activa.";

  return (
    <main className="portal-auth-shell">
      <div className="portal-auth-card">
        <h1>
          Acceso <em>pausado</em>.
        </h1>
        <p className="sub">
          {reason} Acércate a recepción o escríbenos para renovar y recuperar el
          acceso a tu portal.
        </p>

        <div
          style={{
            marginTop: 18,
            padding: "14px 16px",
            border: "1px solid var(--pt-line)",
            borderRadius: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <Row label="Socio" value={`${member.firstName} ${member.lastName}`} />
          <Row label="Correo" value={member.email ?? "—"} />
          <Row label="Teléfono" value={member.phone ?? "—"} />
          <Row label="Socio desde" value={shortDate(member.joinedAt)} />
        </div>

        <form action={portalSignOut} style={{ marginTop: 22 }}>
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "11px 12px",
              background: "transparent",
              color: "var(--pt-ink-3)",
              border: "1px solid var(--pt-line)",
              borderRadius: 10,
              fontSize: 12,
              fontFamily: "var(--pt-font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              cursor: "pointer",
            }}
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--pt-ink-3)" }}>{label}</span>
      <span style={{ color: "var(--pt-ink-1)", textAlign: "right" }}>{value}</span>
    </div>
  );
}
