import { notFound } from "next/navigation";
import { getMember, getMembershipPlans } from "@/lib/actions/members";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MemberActions } from "./member-actions";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  TRIAL: "Trial",
  PAUSED: "Pausado",
  CHURNED: "Baja",
  LEAD: "Lead",
};

const statusColors: Record<string, string> = {
  ACTIVE: "text-emerald-700 bg-emerald-50 border-emerald-200",
  TRIAL: "text-blue-700 bg-blue-50 border-blue-200",
  PAUSED: "text-amber-700 bg-amber-50 border-amber-200",
  CHURNED: "text-red-700 bg-red-50 border-red-200",
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [member, plans] = await Promise.all([
    getMember(id),
    getMembershipPlans(),
  ]);
  if (!member) return notFound();

  const now = new Date();
  const activeMembership = member.memberships.find(
    (m) => m.state === "ACTIVE" && new Date(m.endsAt) >= now,
  );
  const latestLevel = member.trainingLevels[0];

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {member.firstName} {member.lastName}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className={statusColors[member.status] ?? ""}>
              {statusLabels[member.status] ?? member.status}
            </Badge>
            <span>{member.sede === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme"}</span>
            {latestLevel && <Badge variant="outline">Nivel {latestLevel.level.replace("LEVEL_", "")}</Badge>}
          </div>
        </div>
        <MemberActions memberId={member.id} status={member.status} plans={plans} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Info personal */}
        <Card>
          <CardHeader>
            <CardTitle>Información personal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Email" value={member.email} />
            <Row label="Teléfono" value={member.phone} />
            <Row
              label="Fecha de nacimiento"
              value={member.dateOfBirth?.toLocaleDateString("es-EC")}
            />
            <Row label="Contacto emergencia" value={member.emergencyName} />
            <Row label="Tel. emergencia" value={member.emergencyPhone} />
            <Row
              label="Ingreso"
              value={member.joinedAt.toLocaleDateString("es-EC")}
            />
            {member.notes && (
              <>
                <Separator />
                <p className="text-muted-foreground">{member.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Membresía activa */}
        <Card>
          <CardHeader>
            <CardTitle>Membresía</CardTitle>
            <CardDescription>
              {activeMembership
                ? `Plan: ${activeMembership.plan.name}`
                : "Sin membresía activa"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {activeMembership ? (
              <>
                <Row
                  label="Inicio"
                  value={new Date(activeMembership.startsAt).toLocaleDateString("es-EC")}
                />
                <Row
                  label="Vencimiento"
                  value={new Date(activeMembership.endsAt).toLocaleDateString("es-EC")}
                />
                <Row label="Estado" value={activeMembership.state} />
                <Row
                  label="Auto-renovar"
                  value={activeMembership.autoRenew ? "Sí" : "No"}
                />
              </>
            ) : (
              <p className="text-muted-foreground">
                Asigna un plan desde las acciones de arriba.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historial de membresías */}
      {member.memberships.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de membresías</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {member.memberships.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1 border-b last:border-0">
                  <span>{m.plan.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {new Date(m.startsAt).toLocaleDateString("es-EC")} — {new Date(m.endsAt).toLocaleDateString("es-EC")}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {m.state}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Asistencia reciente */}
      {member.attendance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Asistencia reciente</CardTitle>
            <CardDescription>Últimas 20 clases</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {member.attendance.map((a) => (
                <div key={a.id} className="flex justify-between py-1 border-b last:border-0">
                  <span>{a.classSession.schedule?.name ?? "Sesión"}</span>
                  <span className="text-muted-foreground">
                    {new Date(a.recordedAt).toLocaleDateString("es-EC")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? "—"}</span>
    </div>
  );
}
