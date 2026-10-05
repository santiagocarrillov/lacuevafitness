import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ListChecks, MessageCircle, Phone, StickyNote, UserPlus } from "lucide-react";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { getLead, getStaffUsers } from "@/lib/actions/leads";
import { getAssignableUsers, getPersonTasks } from "@/lib/actions/staff-tasks";
import { Badge } from "@/components/ui/badge";
import { ecuadorDateString, ecuadorDateTimeInput, ECUADOR_TZ } from "@/lib/timezone";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/leads/stages";
import { loadPersonTimeline, TIMELINE_KIND_LABEL } from "@/lib/ficha/timeline";
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
import { WhatsappPanel } from "@/components/ficha/whatsapp-panel";
import { EditablePropList } from "@/components/ficha/editable-props";
import { SegmentsCard } from "@/components/ficha/segments-card";
import { getPersonSegments, listSegments } from "@/lib/actions/segment-lists";
import { getConversationThread } from "@/lib/actions/comunicacion";
import { fichaTemplatePreviews } from "@/lib/whatsapp/templates";
import { Timeline } from "@/components/ficha/timeline";
import { Composer } from "@/components/ficha/composer";
import { NEW_TASK_HASH, PersonTasksSection } from "@/components/ficha/person-tasks-section";
import { WhatsappSummary } from "@/components/ficha/whatsapp-card";
import { StageControl } from "./stage-control";

export const dynamic = "force-dynamic";

const sourceLabels: Record<string, string> = {
  INSTAGRAM: "Instagram", FACEBOOK: "Facebook", WHATSAPP: "WhatsApp",
  PHONE_CALL: "Llamada", WEB_FORM: "Formulario web", WALK_IN: "Visita directa",
  REFERRAL: "Referido", TIKTOK: "TikTok", OTHER: "Otro",
};

const sedeLabel = (s: string) => (s === "FITNESS_CENTER" ? "Fitness Center" : "Xtreme");
const dateFmt = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: ECUADOR_TZ }) : null;
const dateTimeFmt = (d: Date | null | undefined) =>
  d
    ? d.toLocaleString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: ECUADOR_TZ })
    : null;

function daysSince(d: Date) {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

/**
 * La ficha de un lead. Es la misma pantalla que la del socio (ficha única):
 * en cuanto la persona tiene ficha de socio, este enlace la lleva allá, donde
 * la historia del lead sigue en la línea de tiempo.
 */
export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "whatsapp" ? "whatsapp" : "actividad";
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");

  const lead = await getLead(id);
  if (!lead) return notFound();
  if (lead.member) redirect(`/dashboard/socios/${lead.member.id}`);

  const seesSegments = can.viewSegments(user);
  const [tasks, staff, personSegments, segmentOptions, taskUsers] = await Promise.all([
    getPersonTasks({ kind: "lead", id }, 50),
    getStaffUsers(),
    seesSegments ? getPersonSegments({ kind: "lead", id }) : Promise.resolve([]),
    seesSegments ? listSegments() : Promise.resolve([]),
    getAssignableUsers(),
  ]);
  // La actividad se carga siempre: la última entrada alimenta el resumen de arriba.
  const [timeline, waThread] = await Promise.all([
    loadPersonTimeline(user, { leadId: lead.id }, tasks.closed),
    tab === "whatsapp" && lead.conversation ? getConversationThread(lead.conversation.id) : Promise.resolve(null),
  ]);

  const name = `${lead.firstName} ${lead.lastName ?? ""}`.trim();
  const base = `/dashboard/leads/${lead.id}`;
  const person = { kind: "lead" as const, id: lead.id, name };
  const lastActivity = timeline[0];
  const now = new Date();
  const ad = lead.adHeadline ?? (lead.adSourceId ? `ID ${lead.adSourceId}` : null);

  const left = (
    <>
      <div className="flex items-center justify-between px-4 pt-3">
        <Link href="/dashboard/leads" className="text-xs font-medium text-primary hover:underline">
          ‹ Leads
        </Link>
        <Link href={`${base}/editar`} className="text-xs font-medium text-primary hover:underline">
          Editar
        </Link>
      </div>
      <div className="px-4 pb-5 pt-4">
        <div className="flex items-start gap-3">
          <Initials name={name} />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="text-lg font-semibold leading-tight">{name}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Lead · {sedeLabel(lead.sede)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline" className={STAGE_COLOR[lead.stage]}>
                {STAGE_LABEL[lead.stage]}
              </Badge>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <QuickActions>
            <QuickAction href={`${base}#nota`} label="Nota" icon={<StickyNote className="size-4" />} />
            <QuickAction
              href={`${base}?tab=whatsapp`}
              label="WhatsApp"
              icon={<MessageCircle className="size-4" />}
              disabled={!lead.conversation && !lead.phone}
              title={!lead.conversation && !lead.phone ? "Sin teléfono" : undefined}
            />
            <QuickAction
              href={telLink(lead.phone)}
              external
              label="Llamar"
              icon={<Phone className="size-4" />}
              disabled={!lead.phone}
              title={lead.phone ? undefined : "Sin teléfono"}
            />
            <QuickAction href={NEW_TASK_HASH} external label="Tarea" icon={<ListChecks className="size-4" />} />
            <QuickAction href={`${base}/convertir`} label="Socio" icon={<UserPlus className="size-4" />} title="Convertir a socio" />
          </QuickActions>
        </div>
      </div>
    </>
  );

  const about = (
    <>
      <FichaSection title="Sobre este lead">
        <EditablePropList
          target={{ kind: "lead", id: lead.id }}
          props={[
            { field: "firstName", label: "Nombre", value: lead.firstName },
            { field: "lastName", label: "Apellido", value: lead.lastName ?? "" },
            {
              field: "email",
              label: "Correo",
              value: lead.email ?? "",
              kind: "email",
              href: lead.email ? `mailto:${lead.email}` : undefined,
              external: true,
            },
            { field: "phone", label: "Celular", value: lead.phone ?? "", kind: "tel", href: telLink(lead.phone), external: true },
            {
              field: "sede",
              label: "Sede de interés",
              value: lead.sede,
              kind: "select",
              options: [
                { value: "FITNESS_CENTER", label: "Fitness Center" },
                { value: "XTREME", label: "Xtreme" },
              ],
              readOnly: !!getSedeScope(user),
            },
            {
              field: "ownerUserId",
              label: "Responsable",
              value: lead.ownerUserId ?? "",
              kind: "select",
              options: [{ value: "", label: "Sin asignar" }, ...staff.map((u) => ({ value: u.id, label: u.fullName }))],
            },
            { field: "notes", label: "Notas", value: lead.notes ?? "", kind: "textarea" },
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">Creado el {dateFmt(lead.createdAt)}.</p>
      </FichaSection>
      <FichaSection title="Origen">
        <EditablePropList
          target={{ kind: "lead", id: lead.id }}
          props={[
            {
              field: "source",
              label: "Canal",
              value: lead.source,
              kind: "select",
              options: Object.entries(sourceLabels).map(([value, label]) => ({ value, label })),
            },
            { field: "ad", label: "Anuncio", value: ad ?? "", href: lead.adSourceUrl ?? undefined, external: true, readOnly: true },
            { field: "adReferredAt", label: "Llegó del anuncio", value: dateTimeFmt(lead.adReferredAt) ?? "", readOnly: true },
          ]}
        />
      </FichaSection>
      <FichaSection title="Evaluación">
        <EditablePropList
          target={{ kind: "lead", id: lead.id }}
          props={[
            {
              field: "trialScheduledAt",
              label: "Agendada para",
              value: ecuadorDateTimeInput(lead.trialScheduledAt),
              display: dateTimeFmt(lead.trialScheduledAt) ?? "",
              kind: "datetime",
            },
            {
              field: "trialAttended",
              label: "¿Vino?",
              value: lead.trialAttended == null ? "" : lead.trialAttended ? "yes" : "no",
              kind: "select",
              options: [
                { value: "", label: "Sin registrar" },
                { value: "yes", label: "Sí vino" },
                { value: "no", label: "No vino" },
              ],
            },
            ...(lead.stage === "LOST" || lead.stage === "DISQUALIFIED"
              ? [{ field: "lostReason", label: "Motivo", value: lead.lostReason ?? "", kind: "textarea" as const }]
              : []),
          ]}
        />
      </FichaSection>
    </>
  );

  const center = (
    <>
      <Highlights
        items={[
          { label: "Creado", value: dateFmt(lead.createdAt), hint: `${sourceLabels[lead.source] ?? lead.source}` },
          { label: "Etapa", value: STAGE_LABEL[lead.stage] },
          {
            label: "Última actividad",
            value: lastActivity ? lastActivity.when : "--",
            hint: lastActivity?.title,
          },
          { label: "En el embudo", value: `${daysSince(lead.createdAt)} días` },
          {
            label: "Evaluación",
            value: lead.trialScheduledAt ? dateTimeFmt(lead.trialScheduledAt) : "Sin agendar",
            hint: lead.trialScheduledAt && lead.trialScheduledAt < now && lead.trialAttended == null ? "Falta registrar si vino" : undefined,
          },
        ]}
      />
      <div className="mt-4">
        <FichaTabs
          tabs={[
            { key: "actividad", label: "Actividad" },
            { key: "whatsapp", label: "WhatsApp" },
          ]}
          active={tab}
          base={base}
        />
      </div>
      {tab === "actividad" ? (
        <>
          <Composer target={{ kind: "lead", id: lead.id }} />
          <div className="mt-4">
            <Timeline items={timeline} labels={TIMELINE_KIND_LABEL} underTabs />
          </div>
        </>
      ) : (
        <WhatsappPanel
          person={{ kind: "lead", id: lead.id }}
          hasPhone={!!lead.phone}
          initial={waThread}
          templates={fichaTemplatePreviews("lead", lead.firstName, lead.lastName)}
        />
      )}
    </>
  );

  const right = (
    <div className="pb-6">
      <FichaSection title="Etapa del embudo">
        <StageControl leadId={lead.id} stage={lead.stage} />
      </FichaSection>
      <PersonTasksSection
        person={person}
        open={tasks.open}
        closed={tasks.closed}
        today={ecuadorDateString()}
        base={{ users: taskUsers, currentUserId: user.id, canPool: can.manageLeads(user), defaultSede: user.sede }}
      />
      {seesSegments && (
        <FichaSection title="Segmentos" count={personSegments.length}>
          <SegmentsCard person={{ kind: "lead", id: lead.id }} auto={[]} lists={personSegments} options={segmentOptions} />
        </FichaSection>
      )}
      <FichaSection title="WhatsApp">
        <WhatsappSummary
          conversation={lead.conversation}
          writeHref={lead.phone || lead.conversation ? `${base}?tab=whatsapp` : undefined}
          fallback={<p className="text-xs text-muted-foreground">No ha escrito al número de WhatsApp de La Cueva.</p>}
        />
      </FichaSection>
    </div>
  );

  return <FichaLayout left={left} about={about} center={center} right={right} />;
}
