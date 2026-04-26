import { notFound } from "next/navigation";
import Link from "next/link";
import { getMember, getMembershipPlans } from "@/lib/actions/members";
import { getMemberNotes } from "@/lib/actions/notes";
import { getMemberChallenges } from "@/lib/actions/challenges";
import { getMemberAnalytics } from "@/lib/actions/analytics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { MemberActions } from "./member-actions";
import { NotesTimeline } from "./notes-timeline";
import { BodyCompSection } from "./body-comp-section";
import { TestResultsSection } from "./test-results-section";
import { ChallengesSection } from "./challenges-section";
import { MembershipEditor } from "./membership-editor";
import { ChurnRiskBadge } from "./churn-risk-badge";
import { MemberInfoEditor } from "./member-info-editor";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  ACTIVE: "Activo", TRIAL: "Trial", PAUSED: "Congelado", CHURNED: "Cancelado", LEAD: "Lead",
};
const statusColors: Record<string, string> = {
  ACTIVE: "text-emerald-700 bg-emerald-50 border-emerald-200",
  TRIAL: "text-blue-700 bg-blue-50 border-blue-200",
  PAUSED: "text-amber-700 bg-amber-50 border-amber-200",
  CHURNED: "text-red-700 bg-red-50 border-red-200",
};

const membershipStatusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  EXPIRING_SOON: "Por vencer",
  EXPIRED: "Vencido",
  FROZEN: "Congelado",
  CANCELED: "Cancelado",
  NONE: "Sin membresía",
};

const membershipStatusColors: Record<string, string> = {
  ACTIVE: "text-emerald-700 bg-emerald-50 border-emerald-200",
  EXPIRING_SOON: "text-amber-700 bg-amber-50 border-amber-200",
  EXPIRED: "text-red-700 bg-red-50 border-red-200",
  FROZEN: "text-blue-700 bg-blue-50 border-blue-200",
  CANCELED: "text-zinc-700 bg-zinc-100 border-zinc-200",
  NONE: "text-zinc-700 bg-zinc-100 border-zinc-200",
};

const sourceLabels: Record<string, string> = {
  INSTAGRAM: "Instagram", FACEBOOK: "Facebook", WHATSAPP: "WhatsApp",
  PHONE_CALL: "Llamada", WEB_FORM: "Web", WALK_IN: "Visita directa",
  REFERRAL: "Referido", TIKTOK: "TikTok", OTHER: "Otro",
};

const paymentMethodLabels: Record<string, string> = {
  STRIPE_CARD: "Tarjeta", STRIPE_LINK: "Link", BANK_TRANSFER: "Transferencia",
  CASH: "Efectivo", OTHER: "Otro",
};

const testLabels: Record<string, string> = {
  BACK_SQUAT_3RM: "Back Squat 3RM",
  DEADLIFT_3RM: "Deadlift 3RM",
  BENCH_PRESS_3RM: "Bench Press 3RM",
  PUSH_PRESS_3RM: "Push Press 3RM",
  DEAD_HANG_SECONDS: "Dead Hang",
  PULL_UPS_MAX: "Pull-ups",
  RING_ROW_ANGLE: "Ring Row (ángulo)",
  PLANK_SECONDS: "Plank",
  CHRISTINE_TIME_SECONDS: "Christine (3 RFT)",
  COOPER_METERS: "Cooper 12 min",
  CLEAN_JERK_1RM: "Clean & Jerk 1RM",
  SNATCH_1RM: "Snatch 1RM",
  ROW_500M_SPRINT_SECONDS: "500m Remo Sprint",
};

function fmt$(cents: number) {
  return `$${(cents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [member, plans, notes, challenges, analytics] = await Promise.all([
    getMember(id),
    getMembershipPlans(),
    getMemberNotes(id),
    getMemberChallenges(id),
    getMemberAnalytics(id),
  ]);
  if (!member) return notFound();

  const now = new Date();
  const activeMembership = member.memberships.find(
    (m) => m.state === "ACTIVE" && new Date(m.endsAt) >= now,
  );
  const latestLevel = member.trainingLevels[0];

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {member.firstName} {member.lastName}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <Badge variant="outline" className={statusColors[member.status] ?? ""}>
              {statusLabels[member.status] ?? member.status}
            </Badge>
            <Badge variant="outline" className={membershipStatusColors[analytics.membershipStatus] ?? ""}>
              Membresía: {membershipStatusLabels[analytics.membershipStatus]}
            </Badge>
            <span>{member.sede === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme"}</span>
            {latestLevel && <Badge variant="outline">Nivel {latestLevel.level.replace("LEVEL_", "")}</Badge>}
            <ChurnRiskBadge risk={analytics.churnRisk} reasons={analytics.churnReasons} />
          </div>
        </div>
        <MemberActions memberId={member.id} status={member.status} plans={plans} />
      </header>

      {/* Stats cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="LTV" value={fmt$(analytics.ltvCents)} hint={`${analytics.totalPayments} pagos`} />
        <StatCard label="Ticket promedio" value={fmt$(analytics.avgTicketCents)} />
        <StatCard
          label="Frecuencia"
          value={`${analytics.weeklyFrequencyRecent.toFixed(1)}x/sem`}
          hint={`Histórico: ${analytics.weeklyFrequency.toFixed(1)}x/sem`}
        />
        <StatCard
          label="Última asistencia"
          value={analytics.daysSinceLastAttendance != null
            ? analytics.daysSinceLastAttendance === 0
              ? "Hoy"
              : `Hace ${analytics.daysSinceLastAttendance}d`
            : "Nunca"
          }
          hint={analytics.lastAttendanceAt
            ? new Date(analytics.lastAttendanceAt).toLocaleDateString("es-EC")
            : ""
          }
        />
        <StatCard
          label="Asistencias"
          value={analytics.totalAttendance.toString()}
          hint={`${analytics.attendanceLast30Days} en 30d`}
        />
        <StatCard
          label="Horario habitual"
          value={analytics.preferredHourLabel}
          hint={analytics.topSchedules[0]?.name ?? ""}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Info personal */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Información personal</CardTitle>
            <MemberInfoEditor
              memberId={member.id}
              member={{
                firstName: member.firstName,
                lastName: member.lastName,
                email: member.email,
                phone: member.phone,
                dateOfBirth: member.dateOfBirth?.toISOString() ?? null,
                address: member.address,
                occupation: member.occupation,
                emergencyName: member.emergencyName,
                emergencyPhone: member.emergencyPhone,
                notes: member.notes,
              }}
            />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Email" value={member.email} />
            <Row label="Teléfono" value={member.phone} />
            <Row label="Nacimiento" value={member.dateOfBirth?.toLocaleDateString("es-EC")} />
            <Row label="Dirección" value={member.address} />
            <Row label="Ocupación" value={member.occupation} />
            <Row label="Emergencia" value={member.emergencyName} />
            <Row label="Tel. emergencia" value={member.emergencyPhone} />
            <Row label="Ingreso" value={member.joinedAt.toLocaleDateString("es-EC")} />

            {/* Lead origin */}
            {member.lead && (
              <>
                <Separator className="my-2" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Origen del socio
                  </p>
                  <Row
                    label="Canal de origen"
                    value={sourceLabels[member.lead.source] ?? member.lead.source}
                  />
                  <Row
                    label="Primera vez"
                    value={member.lead.createdAt.toLocaleDateString("es-EC")}
                  />
                  {member.lead.convertedAt && (
                    <Row
                      label="Convertido a socio"
                      value={member.lead.convertedAt.toLocaleDateString("es-EC")}
                    />
                  )}
                  <Link
                    href={`/dashboard/leads?q=${encodeURIComponent(member.firstName)}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Ver historial de lead →
                  </Link>
                </div>
              </>
            )}

            {member.notes && (
              <>
                <Separator className="my-2" />
                <p className="text-muted-foreground italic">{member.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Membresía activa con editor */}
        <Card>
          <CardHeader>
            <CardTitle>Membresía</CardTitle>
            <CardDescription>
              {activeMembership ? `Plan: ${activeMembership.plan.name}` : "Sin membresía activa"}
              {analytics.daysUntilRenewal !== null && (
                <span className="ml-2">
                  ·{" "}
                  <span className={
                    analytics.membershipStatus === "EXPIRING_SOON" ? "text-amber-600 font-medium" : ""
                  }>
                    Renueva en {analytics.daysUntilRenewal} días
                  </span>
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {activeMembership ? (
              <MembershipEditor membership={{
                id: activeMembership.id,
                planName: activeMembership.plan.name,
                priceCents: activeMembership.plan.priceCents,
                customPriceCents: activeMembership.customPriceCents,
                paymentMethod: activeMembership.paymentMethod,
                billingNote: activeMembership.billingNote,
                startsAt: activeMembership.startsAt.toISOString(),
                endsAt: activeMembership.endsAt.toISOString(),
                state: activeMembership.state,
                autoRenew: activeMembership.autoRenew,
              }} memberId={member.id} />
            ) : (
              <p className="text-muted-foreground">Asigna un plan desde las acciones de arriba.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Retos activos */}
      {challenges.length > 0 && (
        <ChallengesSection challenges={challenges} />
      )}

      {/* Notas de comunicación (timeline) */}
      <NotesTimeline notes={notes} memberId={member.id} />

      {/* Composición corporal */}
      <BodyCompSection
        bodyComps={member.bodyCompositions}
        memberId={member.id}
      />

      {/* Resultados de tests SRXFit */}
      <TestResultsSection
        testResults={member.testResults}
        memberId={member.id}
        testLabels={testLabels}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Historial de membresías */}
        {member.memberships.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Historial de membresías</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {member.memberships.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div>
                      <span>{m.plan.name}</span>
                      {m.customPriceCents != null && (
                        <span className="text-muted-foreground ml-2">
                          ({fmt$(m.customPriceCents)})
                        </span>
                      )}
                      {m.billingNote && (
                        <span className="text-xs text-muted-foreground ml-2">— {m.billingNote}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {new Date(m.startsAt).toLocaleDateString("es-EC")} → {new Date(m.endsAt).toLocaleDateString("es-EC")}
                      </span>
                      <Badge variant="outline" className="text-xs">{m.state}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historial de pagos */}
        {member.payments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Historial de pagos</CardTitle>
              <CardDescription>Últimos {member.payments.length} pagos · LTV: {fmt$(analytics.ltvCents)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                {member.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {paymentMethodLabels[p.method] ?? p.method}
                      </Badge>
                      <span className="font-medium">{fmt$(p.amountCents)}</span>
                      {p.membership && (
                        <span className="text-xs text-muted-foreground">{p.membership.plan.name}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString("es-EC") : "Pendiente"}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Asistencia + horarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {member.attendance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Asistencia reciente</CardTitle>
              <CardDescription>
                Últimas 20 · {analytics.attendanceLast7Days} esta semana · {analytics.attendanceLast30Days} en 30 días
              </CardDescription>
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

        {analytics.topSchedules.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Horarios habituales</CardTitle>
              <CardDescription>Top 3 clases más asistidas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {analytics.topSchedules.map((s) => (
                  <div key={s.name + s.startTime} className="flex justify-between py-1 border-b last:border-0">
                    <span>{s.name}</span>
                    <Badge variant="outline" className="text-xs">{s.count} veces</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
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
