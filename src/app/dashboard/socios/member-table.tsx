import { FrequencyBadge } from "@/components/frequency-badge";
import { DataTable, PersonCell, td, th } from "@/components/list/list-ui";
import { MEMBER_STATUS_COLOR, MEMBER_STATUS_LABEL } from "@/lib/leads/stages";
import type { MemberStatus } from "@/generated/prisma/client";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  sede: string;
  status: string;
  joinedAt: Date;
  memberships: {
    endsAt: Date;
    state: string;
    plan: { name: string };
  }[];
  _count?: { attendance: number };
};

const sedeLabels: Record<string, string> = { FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme" };
const dateFmt = (d: Date) =>
  new Date(d).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guayaquil" });

export function MemberTable({ members }: { members: MemberRow[] }) {
  const now = new Date();
  return (
    <DataTable>
      <thead>
        <tr>
          <th className={th}>Nombre</th>
          <th className={th}>Teléfono</th>
          <th className={th}>Sede</th>
          <th className={th}>Estado</th>
          <th className={th}>Asistencia 30 d</th>
          <th className={th}>Plan actual</th>
          <th className={th}>Vence</th>
          <th className={th}>Socio desde</th>
        </tr>
      </thead>
      <tbody>
        {members.length === 0 ? (
          <tr>
            <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
              No hay socios que coincidan con los filtros.
            </td>
          </tr>
        ) : (
          members.map((m) => {
            const membership = m.memberships[0];
            const expired = membership && new Date(membership.endsAt) < now;
            return (
              <tr key={m.id} className="transition hover:bg-muted/40">
                <td className={td}>
                  <PersonCell href={`/dashboard/socios/${m.id}`} name={`${m.firstName} ${m.lastName}`.trim()} sub={m.email} />
                </td>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{m.phone ?? "--"}</td>
                <td className={`${td} whitespace-nowrap`}>{sedeLabels[m.sede] ?? m.sede}</td>
                <td className={td}>
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
                      MEMBER_STATUS_COLOR[m.status as MemberStatus] ?? ""
                    }`}
                  >
                    {MEMBER_STATUS_LABEL[m.status as MemberStatus] ?? m.status}
                  </span>
                </td>
                <td className={td}>
                  <FrequencyBadge visitsLast30={m._count?.attendance ?? 0} showCount />
                </td>
                <td className={`${td} whitespace-nowrap`}>{membership?.plan.name ?? <span className="text-muted-foreground">--</span>}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {membership ? (
                    <span className={expired ? "font-medium text-destructive" : ""}>
                      {dateFmt(membership.endsAt)}
                      {expired && " · vencida"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{dateFmt(m.joinedAt)}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </DataTable>
  );
}
