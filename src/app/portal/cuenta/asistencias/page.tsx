import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { longDate } from "@/lib/portal/format";

export const dynamic = "force-dynamic";

const sedeLabels: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

export default async function AsistenciasPage() {
  const { member } = await requireMember();
  const records = await prisma.attendance.findMany({
    where: { memberId: member.id },
    include: { classSession: { include: { schedule: true } } },
    orderBy: { recordedAt: "desc" },
    take: 80,
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
        <div className="portal-kicker">Últimos 80 registros</div>
        <h2 className="portal-title">
          Tus <em>asistencias</em>
        </h2>
      </div>
      {records.length === 0 ? (
        <div className="portal-card">
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
            Cuando entrenes, cada visita aparecerá aquí.
          </p>
        </div>
      ) : (
        records.map((a) => (
          <div key={a.id} className="portal-list-item">
            <div className="li-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 8v4l3 2" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </div>
            <div className="info">
              <div className="t">{longDate(a.recordedAt)}</div>
              <div className="s">
                {sedeLabels[a.classSession.sede] ?? "Clase"} ·{" "}
                {a.classSession.schedule?.name ?? a.classSession.schedule?.startTime ?? ""}
              </div>
            </div>
          </div>
        ))
      )}
    </PortalShell>
  );
}
