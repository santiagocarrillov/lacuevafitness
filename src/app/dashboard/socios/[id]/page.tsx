import { notFound } from "next/navigation";
import Link from "next/link";
import { Bell, ListChecks, MessageCircle, Phone, RefreshCw, StickyNote } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { getMember, getMembershipPlans } from "@/lib/actions/members";
import { getMemberChallenges } from "@/lib/actions/challenges";
import { getMemberAnalytics } from "@/lib/actions/analytics";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberActions } from "./member-actions";
import { InviteMemberButton } from "./invite-member-button";
import { HealthSection } from "./health-section";
import { ClinicalRecordsSection } from "./clinical-records-section";
import { getClinicalRecords } from "@/lib/actions/clinical-records";
import { NutritionSection } from "./nutrition-section";
import { NutritionAppointmentsCard } from "./nutrition-appointments-card";
import { getMemberAppointments } from "@/lib/actions/nutrition-appointments";
import { getMemberMealPlans, getMemberMealLogs, getNutritionFocus } from "@/lib/actions/nutrition";
import { TestResultsSection } from "./test-results-section";
import { SelfEntriesSection } from "./self-entries-section";
import { getMemberSelfEntries } from "@/lib/actions/self-log";
import { ChallengesSection } from "./challenges-section";
import { MembershipEditor } from "./membership-editor";
import { MembershipPaymentPanel } from "./membership-payment-panel";
import { ChurnRiskBadge } from "./churn-risk-badge";
import { FrequencyBadge } from "@/components/frequency-badge";
import { getPersonTasks } from "@/lib/actions/staff-tasks";
import { ecuadorDateString, ECUADOR_TZ } from "@/lib/timezone";
import { MEMBER_STATUS_COLOR, MEMBER_STATUS_LABEL } from "@/lib/leads/stages";
import { loadPersonTimeline, money, TIMELINE_KIND_LABEL } from "@/lib/ficha/timeline";
import {
  FichaLayout,
  FichaSection,
  FichaTabs,
  Highlights,
  Initials,
  PropList,
  QuickAction,
  QuickActions,
  telLink,
} from "@/components/ficha/layout";
import { Timeline } from "@/components/ficha/timeline";
import { Composer } from "@/components/ficha/composer";
import { PersonTasks, newTaskHref } from "@/components/ficha/person-tasks";
import { WhatsappSummary } from "@/components/ficha/whatsapp-card";
import { WhatsappPanel } from "@/components/ficha/whatsapp-panel";
import { EditablePropList } from "@/components/ficha/editable-props";
import { getConversationThread } from "@/lib/actions/comunicacion";
import { fichaTemplatePreviews } from "@/lib/whatsapp/templates";

export const dynamic = "force-dynamic";

const membershipStatusLabels: Record<string, string> = {
  ACTIVE: "Al día",
  EXPIRING_SOON: "Por vencer",
  EXPIRED: "Vencida",
  FROZEN: "Congelada",
  CANCELED: "Cancelada",
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
  CASH: "Efectivo", PLUX_CARD: "TC Plux", OTHER: "Otro",
};

const membershipStateLabels: Record<string, string> = {
  PENDING_PAYMENT: "Por pagar", ACTIVE: "Vigente", EXPIRED: "Vencida", CANCELED: "Cancelada", PAUSED: "Pausada",
};

const sedeLabel = (s: string) => (s === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme");

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

const dateFmt = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: ECUADOR_TZ }) : null;
// Fechas guardadas como día (nacimiento): medianoche UTC, no se convierten.
const dayFmt = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

function age(dob: Date | null) {
  if (!dob) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) a--;
  return a;
}

type Tab = "actividad" | "whatsapp" | "membresia" | "salud" | "nutricion";

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const user = await requireAuth();
  const canEditHealth = user.role === "OWNER" || user.role === "NUTRITIONIST";
  const canSchedule = can.scheduleNutrition(user);
  const showNutritionTab = canEditHealth || canSchedule;
  const seesInbox = can.manageLeads(user);
  const tab: Tab =
    tabParam === "membresia" ||
    tabParam === "salud" ||
    (tabParam === "nutricion" && showNutritionTab) ||
    (tabParam === "whatsapp" && seesInbox)
      ? (tabParam as Tab)
      : "actividad";

  const [member, analytics, tasks, challenges, selfEntries, appointments] = await Promise.all([
    getMember(id),
    getMemberAnalytics(id),
    getPersonTasks({ kind: "member", id }, 50),
    getMemberChallenges(id),
    getMemberSelfEntries(id),
    canSchedule ? getMemberAppointments(id) : Promise.resolve([]),
  ]);
  if (!member) return notFound();

  const name = `${member.firstName} ${member.lastName}`.trim();
  const base = `/dashboard/socios/${member.id}`;
  const today = ecuadorDateString();
  const now = new Date();
  const person = { kind: "member" as const, id: member.id, name };

  // Active membership = state ACTIVE + not expired + not a one-time daily pass.
  // Daily passes are billed as "facturación suelta" — not the socio's plan.
  const activeMembership = member.memberships.find(
    (m) => m.state === "ACTIVE" && new Date(m.endsAt) >= now && m.plan.billingCycle !== "ONE_TIME",
  );
  // Most recent non-daily membership (active or lapsed) — the source for a
  // "Renovar" when the socio has no currently-valid membership.
  const lastMembership = member.memberships.find((m) => m.plan.billingCycle !== "ONE_TIME");
  const canEditMembership = user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN";
  // Front desk edits every field; other staff only fix contact data (same rule as updateMember).
  const canManage = can.manageMembers(user);
  const seesPayments = can.viewPayments(user);
  const latestLevel = member.trainingLevels[0];
  const latestBody = member.bodyCompositions[0];
  const conversation = member.conversation ?? member.lead?.conversation ?? null;
  const pendingSelf = selfEntries.filter((e) => !e.verified).length;
  const nextAppointment = appointments
    .filter((a) => a.status === "SCHEDULED" && a.startsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

  // Only what the open tab needs.
  const [timeline, plans, tabData, waThread] = await Promise.all([
    tab === "actividad" ? loadPersonTimeline(user, { leadId: member.leadId, memberId: member.id }, tasks.closed) : Promise.resolve([]),
    tab === "membresia" ? getMembershipPlans() : Promise.resolve([]),
    (tab === "nutricion" || tab === "salud") && canEditHealth
      ? Promise.all([getClinicalRecords(id), getMemberMealPlans(id), getMemberMealLogs(id), getNutritionFocus(id)])
      : Promise.resolve(null),
    tab === "whatsapp" && conversation ? getConversationThread(conversation.id) : Promise.resolve(null),
  ]);
  const [clinicalRecords, mealPlans, mealLogs, nutritionFocus] = tabData ?? [[], [], [], null];

  const renewHref = canEditMembership ? (lastMembership ? `${base}/renovar` : `${base}/membresia/nueva`) : undefined;

  // ── Izquierda: quién es ────────────────────────────────────────────
  const left = (
    <>
      <div className="flex items-center justify-between px-4 pt-3">
        <Link href="/dashboard/socios" className="text-xs font-medium text-primary hover:underline">
          ‹ Socios
        </Link>
        <Link href={`${base}/editar${can.manageMembers(user) ? "" : "?solo=contacto"}`} className="text-xs font-medium text-primary hover:underline">
          {can.manageMembers(user) ? "Editar" : "Editar contacto"}
        </Link>
      </div>
      <div className="px-4 pb-5 pt-4">
        <div className="flex items-start gap-3">
          <Initials name={name} />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="text-lg font-semibold leading-tight">{name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {sedeLabel(member.sede)}
              {member.secondarySede ? ` + ${sedeLabel(member.secondarySede)}` : ""}
              {latestLevel ? ` · Nivel ${latestLevel.level.replace("LEVEL_", "")}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className={MEMBER_STATUS_COLOR[member.status]}>
                {MEMBER_STATUS_LABEL[member.status]}
              </Badge>
              <FrequencyBadge visitsLast30={analytics.attendanceLast30Days} showCount />
              <ChurnRiskBadge risk={analytics.churnRisk} reasons={analytics.churnReasons} />
            </div>
          </div>
        </div>
        <div className="mt-5">
          <QuickActions>
            <QuickAction href={`${base}#nota`} label="Nota" icon={<StickyNote className="size-4" />} />
            {seesInbox && (
              <QuickAction
                href={`${base}?tab=whatsapp`}
                label="WhatsApp"
                icon={<MessageCircle className="size-4" />}
                disabled={!conversation && !member.phone}
                title={!conversation && !member.phone ? "Sin teléfono en la ficha" : undefined}
              />
            )}
            <QuickAction
              href={telLink(member.phone)}
              external
              label="Llamar"
              icon={<Phone className="size-4" />}
              disabled={!member.phone}
              title={member.phone ? undefined : "Sin teléfono en la ficha"}
            />
            <QuickAction href={newTaskHref(person, base)} label="Tarea" icon={<ListChecks className="size-4" />} />
            {can.manageMembers(user) && <QuickAction href={`${base}/notificar`} label="Notificar" icon={<Bell className="size-4" />} />}
            {renewHref && (
              <QuickAction href={renewHref} label={lastMembership ? "Renovar" : "Plan"} icon={<RefreshCw className="size-4" />} />
            )}
          </QuickActions>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {can.managePortalAccess(user) && (
            <InviteMemberButton
              memberId={member.id}
              hasApp={member.userId != null}
              memberEmail={member.email}
              existingInvite={
                member.portalInviteCode && member.portalInviteCodeExpiresAt && member.portalInviteCodeExpiresAt > now
                  ? { code: member.portalInviteCode, expiresAt: member.portalInviteCodeExpiresAt.toISOString() }
                  : null
              }
            />
          )}
          <MemberActions memberId={member.id} status={member.status} canAssignPlan={false} canChurn={can.manageMembers(user)} />
        </div>
      </div>
    </>
  );

  const about = (
    <>
      <FichaSection title="Sobre este socio">
        <EditablePropList
          target={{ kind: "member", id: member.id }}
          props={[
            { field: "firstName", label: "Nombre", value: member.firstName, readOnly: !canManage },
            { field: "lastName", label: "Apellido", value: member.lastName, readOnly: !canManage },
            {
              field: "email",
              label: "Correo",
              value: member.email ?? "",
              kind: "email",
              href: member.email ? `mailto:${member.email}` : undefined,
              external: true,
            },
            { field: "phone", label: "Celular", value: member.phone ?? "", kind: "tel", href: telLink(member.phone), external: true },
            {
              field: "dateOfBirth",
              label: "Nacimiento",
              value: member.dateOfBirth ? member.dateOfBirth.toISOString().slice(0, 10) : "",
              display: member.dateOfBirth ? `${dayFmt(member.dateOfBirth)} · ${age(member.dateOfBirth)} años` : "",
              kind: "date",
              readOnly: !canManage,
            },
            {
              field: "sex",
              label: "Sexo",
              value: member.sex ?? "",
              kind: "select",
              options: [
                { value: "", label: "--" },
                { value: "FEMALE", label: "Mujer" },
                { value: "MALE", label: "Hombre" },
                { value: "OTHER", label: "Otro" },
              ],
              readOnly: !canManage,
            },
            { field: "occupation", label: "Ocupación", value: member.occupation ?? "", readOnly: !canManage },
            { field: "address", label: "Dirección", value: member.address ?? "", readOnly: !canManage },
            { field: "emergencyName", label: "Contacto de emergencia", value: member.emergencyName ?? "", readOnly: !canManage },
            {
              field: "emergencyPhone",
              label: "Tel. de emergencia",
              value: member.emergencyPhone ?? "",
              kind: "tel",
              href: telLink(member.emergencyPhone),
              external: true,
              readOnly: !canManage,
            },
            {
              field: "sede",
              label: "Sede principal",
              value: member.sede,
              kind: "select",
              options: [
                { value: "FITNESS_CENTER", label: "Fitness Center" },
                { value: "XTREME", label: "Xtreme" },
              ],
              readOnly: !canManage,
            },
            {
              field: "secondarySede",
              label: "También entrena en",
              value: member.secondarySede ?? "",
              kind: "select",
              options: [
                { value: "", label: "--" },
                ...(member.sede === "XTREME" ? [] : [{ value: "XTREME", label: "Xtreme" }]),
                ...(member.sede === "FITNESS_CENTER" ? [] : [{ value: "FITNESS_CENTER", label: "Fitness Center" }]),
              ],
              readOnly: !canManage,
            },
            {
              field: "taxId",
              label: "Cédula / RUC (para facturar)",
              value: member.taxId ?? "",
              display: member.taxId ? `${member.taxIdType === "RUC" ? "RUC" : member.taxIdType === "PASAPORTE" ? "Pasaporte" : "Cédula"} ${member.taxId}` : "",
              placeholder: "10 dígitos cédula · 13 RUC",
              readOnly: !canManage,
            },
            { field: "notes", label: "Notas internas", value: member.notes ?? "", kind: "textarea", readOnly: !canManage },
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">Socio desde {dateFmt(member.joinedAt)}.</p>
      </FichaSection>

      <FichaSection title="Origen" defaultOpen={!!member.lead}>
        {member.lead ? (
          <PropList
            props={[
              { label: "Canal", value: sourceLabels[member.lead.source] ?? member.lead.source },
              {
                label: "Anuncio",
                value: member.lead.adHeadline ?? (member.lead.adSourceId ? `ID ${member.lead.adSourceId}` : null),
                href: member.lead.adSourceUrl ?? undefined,
                external: true,
              },
              { label: "Primer contacto", value: dateFmt(member.lead.createdAt) },
              { label: "Pasó a socio", value: dateFmt(member.lead.convertedAt) },
              { label: "Lo llevó", value: member.lead.owner?.fullName },
            ]}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Sin registro de cómo llegó (socio anterior al CRM).</p>
        )}
      </FichaSection>

      <FichaSection title="Datos físicos">
        <PropList
          props={[
            {
              label: "Peso",
              value: latestBody?.weightKg != null ? `${latestBody.weightKg} kg` : null,
              href: latestBody ? `${base}/medicion/${latestBody.id}` : undefined,
            },
            { label: "% Grasa", value: latestBody?.bodyFatPct != null ? `${latestBody.bodyFatPct}%` : null },
            { label: "% Músculo", value: latestBody?.muscleMassPct != null ? `${latestBody.muscleMassPct}%` : null },
            { label: "Última medición", value: dateFmt(latestBody?.measuredAt) },
            { label: "Objetivo", value: member.goals.find((g) => !g.achieved)?.goal ?? null },
          ]}
        />
        <Link href={`${base}?tab=salud`} scroll={false} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
          Ver salud y entrenamiento →
        </Link>
      </FichaSection>
    </>
  );

  // ── Centro: qué ha pasado ──────────────────────────────────────────
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "actividad", label: "Actividad" },
    ...(seesInbox ? [{ key: "whatsapp" as const, label: "WhatsApp" }] : []),
    { key: "membresia", label: "Membresía y pagos" },
    { key: "salud", label: "Salud y entrenamiento", count: pendingSelf || undefined },
    ...(showNutritionTab ? [{ key: "nutricion" as const, label: "Nutrición" }] : []),
  ];

  const center = (
    <>
      <Highlights
        items={[
          { label: "Estado", value: MEMBER_STATUS_LABEL[member.status] },
          {
            label: "Membresía",
            value: membershipStatusLabels[analytics.membershipStatus],
            hint: analytics.daysUntilRenewal != null ? `Renueva en ${analytics.daysUntilRenewal} días` : activeMembership?.plan.name,
            href: `${base}?tab=membresia`,
          },
          {
            label: "Última asistencia",
            value:
              analytics.daysSinceLastAttendance == null
                ? "Nunca"
                : analytics.daysSinceLastAttendance === 0
                  ? "Hoy"
                  : `Hace ${analytics.daysSinceLastAttendance} d`,
            hint: `${analytics.attendanceLast30Days} en 30 días · ${analytics.weeklyFrequencyRecent.toFixed(1)}x/sem`,
            href: `${base}?tab=salud#asistencia`,
          },
          { label: "Horario habitual", value: analytics.preferredHourLabel, hint: analytics.topSchedules[0]?.name },
          ...(seesPayments
            ? [{ label: "LTV", value: money(analytics.ltvCents), hint: `${analytics.totalPayments} pagos`, href: `${base}?tab=membresia#pagos` }]
            : []),
        ]}
      />
      <div className="mt-4">
        <FichaTabs tabs={tabs} active={tab} base={base} />
      </div>

      {tab === "actividad" && (
        <>
          <Composer target={{ kind: "member", id: member.id }} />
          <div className="mt-4">
            <Timeline items={timeline} labels={TIMELINE_KIND_LABEL} underTabs />
          </div>
        </>
      )}

      {tab === "whatsapp" && (
        <WhatsappPanel
          person={{ kind: "member", id: member.id }}
          hasPhone={!!member.phone}
          initial={waThread}
          templates={fichaTemplatePreviews("member", member.firstName, member.lastName)}
        />
      )}

      {tab === "membresia" && (
        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Membresía</CardTitle>
              <CardDescription>
                {activeMembership ? `Plan: ${activeMembership.plan.name}` : "Sin membresía activa"}
                {analytics.daysUntilRenewal !== null && (
                  <span className={analytics.membershipStatus === "EXPIRING_SOON" ? "ml-2 font-medium text-amber-600" : "ml-2"}>
                    · Renueva en {analytics.daysUntilRenewal} días
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {activeMembership ? (
                <>
                  <MembershipEditor
                    membership={{
                      id: activeMembership.id,
                      planId: activeMembership.planId,
                      planName: activeMembership.plan.name,
                      priceCents: activeMembership.plan.priceCents,
                      customPriceCents: activeMembership.customPriceCents,
                      paymentMethod: activeMembership.paymentMethod,
                      billingNote: activeMembership.billingNote,
                      startsAt: activeMembership.startsAt.toISOString(),
                      endsAt: activeMembership.endsAt.toISOString(),
                      state: activeMembership.state,
                      autoRenew: activeMembership.autoRenew,
                    }}
                    memberId={member.id}
                    plans={plans
                      .filter((p) => p.sede == null || p.sede === member.sede)
                      .map((p) => ({ id: p.id, name: p.name, priceCents: p.priceCents, durationDays: p.durationDays }))}
                  />
                  {canEditMembership && (
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`${base}/membresia/nueva`}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition hover:bg-accent"
                      >
                        Asignar otro plan
                      </Link>
                      <Link
                        href={`${base}/renovar`}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition hover:bg-accent"
                      >
                        ↻ Renovar
                      </Link>
                    </div>
                  )}
                  <MembershipPaymentPanel
                    memberId={member.id}
                    membership={{
                      id: activeMembership.id,
                      priceCents: activeMembership.plan.priceCents,
                      customPriceCents: activeMembership.customPriceCents,
                      startsAt: activeMembership.startsAt,
                      endsAt: activeMembership.endsAt,
                      state: activeMembership.state,
                      planName: activeMembership.plan.name,
                    }}
                    payments={member.payments.map((p) => ({
                      id: p.id,
                      amountCents: p.amountCents,
                      method: p.method,
                      status: p.status,
                      paidAt: p.paidAt,
                      membershipId: p.membershipId,
                      depositorName: p.depositorName,
                      bankReference: p.bankReference,
                      bankEntity: p.bankEntity,
                      notes: p.notes,
                    }))}
                    sede={member.sede}
                    canEdit={canEditMembership}
                  />
                </>
              ) : lastMembership ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    Sin membresía vigente. Última: {lastMembership.plan.name} · venció el {dateFmt(lastMembership.endsAt)}.
                  </p>
                  {canEditMembership && (
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`${base}/membresia/nueva`}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition hover:bg-accent"
                      >
                        Asignar otro plan
                      </Link>
                      <Link
                        href={`${base}/renovar`}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition hover:bg-accent"
                      >
                        ↻ Renovar
                      </Link>
                    </div>
                  )}
                </div>
              ) : canEditMembership ? (
                <Link href={`${base}/membresia/nueva`} className="text-primary hover:underline">
                  Asigna un plan →
                </Link>
              ) : (
                <p className="text-muted-foreground">Sin membresía activa.</p>
              )}
            </CardContent>
          </Card>

          {member.memberships.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Historial de membresías</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {member.memberships.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1 last:border-0">
                      <div>
                        <span>{m.plan.name}</span>
                        {m.customPriceCents != null && <span className="ml-2 text-muted-foreground">({money(m.customPriceCents)})</span>}
                        {m.billingNote && <span className="ml-2 text-xs text-muted-foreground">— {m.billingNote}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {dateFmt(m.startsAt)} → {dateFmt(m.endsAt)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {membershipStateLabels[m.state] ?? m.state}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {member.payments.length > 0 && (
            <Card id="pagos" className="scroll-mt-16">
              <CardHeader>
                <CardTitle>Historial de pagos</CardTitle>
                <CardDescription>
                  Últimos {member.payments.length} pagos · LTV: {money(analytics.ltvCents)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {member.payments.map((p) => {
                    const row = (
                      <>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {paymentMethodLabels[p.method] ?? p.method}
                          </Badge>
                          <span className="font-medium">{money(p.amountCents)}</span>
                          {p.membership && <span className="text-xs text-muted-foreground">{p.membership.plan.name}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">{p.paidAt ? dateFmt(p.paidAt) : "Pendiente"}</span>
                      </>
                    );
                    return seesPayments ? (
                      <Link key={p.id} href={`/dashboard/pagos/${p.id}`} className="-mx-2 flex items-center justify-between rounded border-b px-2 py-1 last:border-0 hover:bg-accent/60">
                        {row}
                      </Link>
                    ) : (
                      <div key={p.id} className="flex items-center justify-between border-b py-1 last:border-0">
                        {row}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "salud" && (
        <div className="mt-4 space-y-4">
          <HealthSection
            memberId={member.id}
            memberName={name}
            dateOfBirth={member.dateOfBirth}
            sex={member.sex}
            bodyComps={member.bodyCompositions}
            clinicalMarkers={member.clinicalMarkers}
            canEdit={canEditHealth}
          />
          {canEditHealth && <ClinicalRecordsSection memberId={member.id} records={clinicalRecords} />}
          <SelfEntriesSection
            memberId={member.id}
            entries={selfEntries}
            canValidate={user.role === "OWNER" || user.role === "ADMIN" || user.role === "COACH" || user.role === "NUTRITIONIST"}
          />
          <TestResultsSection
            testResults={member.testResults}
            memberId={member.id}
            testLabels={testLabels}
            canRegister={user.role === "OWNER" || user.role === "ADMIN" || user.role === "COACH" || user.role === "NUTRITIONIST"}
            memberIsActive={member.status === "ACTIVE" || member.status === "TRIAL"}
          />
          <div id="asistencia" className="grid scroll-mt-16 grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Asistencia reciente</CardTitle>
                <CardDescription>
                  {analytics.totalAttendance} en total · {analytics.attendanceLast7Days} esta semana · {analytics.attendanceLast30Days} en 30 días
                </CardDescription>
              </CardHeader>
              <CardContent>
                {member.attendance.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin asistencias registradas.</p>
                ) : (
                  <div className="space-y-1 text-sm">
                    {member.attendance.map((a) => (
                      <div key={a.id} className="flex justify-between border-b py-1 last:border-0">
                        <span>{a.classSession.schedule?.name ?? "Sesión"}</span>
                        <span className="text-muted-foreground">{dateFmt(a.recordedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {analytics.topSchedules.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Horarios habituales</CardTitle>
                  <CardDescription>Top 3 clases más asistidas</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {analytics.topSchedules.map((s) => (
                      <div key={s.name + s.startTime} className="flex justify-between border-b py-1 last:border-0">
                        <span>{s.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {s.count} veces
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "nutricion" && (
        <div className="mt-4 space-y-4">
          {canSchedule && <NutritionAppointmentsCard memberId={member.id} appointments={appointments} />}
          {canEditHealth && (
            <NutritionSection memberId={member.id} plans={mealPlans} logs={mealLogs} focusMessage={nutritionFocus?.message ?? null} />
          )}
        </div>
      )}
    </>
  );

  // ── Derecha: lo que tiene asociado ─────────────────────────────────
  const right = (
    <div className="pb-6">
      <FichaSection
        title="Membresía"
        action={
          <Link href={`${base}?tab=membresia`} scroll={false} className="text-xs font-medium text-primary hover:underline">
            Gestionar
          </Link>
        }
      >
        {activeMembership ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{activeMembership.plan.name}</span>
              <Badge variant="outline" className={membershipStatusColors[analytics.membershipStatus]}>
                {membershipStatusLabels[analytics.membershipStatus]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {dateFmt(activeMembership.startsAt)} → {dateFmt(activeMembership.endsAt)}
              {analytics.daysUntilRenewal != null ? ` · faltan ${analytics.daysUntilRenewal} días` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {money(activeMembership.customPriceCents ?? activeMembership.plan.priceCents)}
              {activeMembership.billingNote ? ` · ${activeMembership.billingNote}` : ""}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {lastMembership ? `Sin plan vigente. Último: ${lastMembership.plan.name}, venció el ${dateFmt(lastMembership.endsAt)}.` : "Nunca ha tenido un plan."}
          </p>
        )}
        {renewHref && (
          <Link
            href={renewHref}
            className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border border-input bg-background text-sm font-medium transition hover:bg-accent"
          >
            {lastMembership ? "↻ Renovar" : "Asignar plan"}
          </Link>
        )}
      </FichaSection>

      <FichaSection
        title="Tareas"
        count={tasks.open.length}
        action={
          <Link href={newTaskHref(person, base)} className="text-xs font-medium text-primary hover:underline">
            + Tarea
          </Link>
        }
      >
        <PersonTasks open={tasks.open} today={today} />
      </FichaSection>

      {seesInbox && (
        <FichaSection title="WhatsApp">
          <WhatsappSummary
            conversation={conversation}
            writeHref={member.phone || conversation ? `${base}?tab=whatsapp` : undefined}
            fallback={
              <p className="text-xs text-muted-foreground">
                {member.phone ? "Todavía no hay conversación." : "Sin teléfono en la ficha."}
              </p>
            }
          />
        </FichaSection>
      )}

      {pendingSelf > 0 && (
        <FichaSection title="Por validar" count={pendingSelf}>
          <p className="text-xs text-muted-foreground">
            Registró medidas o marcas desde su app. Hasta validarlas no cuentan para rankings ni reportes.
          </p>
          <Link href={`${base}?tab=salud`} scroll={false} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
            Revisar →
          </Link>
        </FichaSection>
      )}

      {canSchedule && (
        <FichaSection
          title="Nutrición"
          action={
            <Link
              href={`/dashboard/nutricion/citas/nueva?socio=${member.id}&volver=${encodeURIComponent(base)}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              + Cita
            </Link>
          }
        >
          {nextAppointment ? (
            <Link href={`/dashboard/nutricion/citas/${nextAppointment.id}`} className="block rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/60">
              <span className="block font-medium">Próxima cita</span>
              <span className="text-xs text-muted-foreground">
                {nextAppointment.startsAt.toLocaleString("es-EC", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: ECUADOR_TZ,
                })}{" "}
                · {nextAppointment.staff.fullName}
              </span>
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">Sin citas próximas.</p>
          )}
          {showNutritionTab && (
            <Link href={`${base}?tab=nutricion`} scroll={false} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
              Ver nutrición →
            </Link>
          )}
        </FichaSection>
      )}

      <FichaSection title="Retos" count={challenges.length} defaultOpen={challenges.length > 0}>
        {challenges.length > 0 ? (
          <div className="[&_[data-slot=card]]:border-0 [&_[data-slot=card]]:p-0 [&_[data-slot=card]]:shadow-none [&_[data-slot=card-header]]:hidden [&_[data-slot=card-content]]:px-0">
            <ChallengesSection challenges={challenges} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No participa en retos activos.</p>
        )}
      </FichaSection>
    </div>
  );

  return <FichaLayout left={left} about={about} center={center} right={right} />;
}
