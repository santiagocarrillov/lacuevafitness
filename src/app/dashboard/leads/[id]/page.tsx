import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ListChecks, MessageCircle, Phone, StickyNote, UserPlus } from "lucide-react";
import { requireAuth, can } from "@/lib/auth";
import { getLead } from "@/lib/actions/leads";
import { getPersonTasks } from "@/lib/actions/staff-tasks";
import { Badge } from "@/components/ui/badge";
import { ecuadorDateString, ECUADOR_TZ } from "@/lib/timezone";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/leads/stages";
import { loadPersonTimeline, TIMELINE_KIND_LABEL } from "@/lib/ficha/timeline";
import {
  FichaLayout,
  FichaSection,
  Highlights,
  Initials,
  PropList,
  QuickAction,
  QuickActions,
  telLink,
  waLink,
} from "@/components/ficha/layout";
import { Timeline } from "@/components/ficha/timeline";
import { Composer } from "@/components/ficha/composer";
import { PersonTasks, newTaskHref } from "@/components/ficha/person-tasks";
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
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");

  const lead = await getLead(id);
  if (!lead) return notFound();
  if (lead.member) redirect(`/dashboard/socios/${lead.member.id}`);

  const tasks = await getPersonTasks({ kind: "lead", id }, 50);
  const timeline = await loadPersonTimeline(user, { leadId: lead.id }, tasks.closed);

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
            {lead.conversation ? (
              <QuickAction href={`/dashboard/comunicacion?c=${lead.conversation.id}`} label="WhatsApp" icon={<MessageCircle className="size-4" />} />
            ) : (
              <QuickAction
                href={waLink(lead.phone)}
                external
                label="WhatsApp"
                icon={<MessageCircle className="size-4" />}
                disabled={!waLink(lead.phone)}
                title={lead.phone ? "Abre WhatsApp en este dispositivo (no hay conversación en el inbox)" : "Sin teléfono"}
              />
            )}
            <QuickAction
              href={telLink(lead.phone)}
              external
              label="Llamar"
              icon={<Phone className="size-4" />}
              disabled={!lead.phone}
              title={lead.phone ? undefined : "Sin teléfono"}
            />
            <QuickAction href={newTaskHref(person, base)} label="Tarea" icon={<ListChecks className="size-4" />} />
            <QuickAction href={`${base}/convertir`} label="Socio" icon={<UserPlus className="size-4" />} title="Convertir a socio" />
          </QuickActions>
        </div>
      </div>
    </>
  );

  const about = (
    <>
      <FichaSection title="Sobre este lead">
        <PropList
          props={[
            { label: "Correo", value: lead.email, href: lead.email ? `mailto:${lead.email}` : undefined, external: true },
            { label: "Celular", value: lead.phone, href: telLink(lead.phone), external: true },
            { label: "Sede de interés", value: sedeLabel(lead.sede) },
            { label: "Responsable", value: lead.owner?.fullName },
            { label: "Notas", value: lead.notes },
            { label: "Creado", value: dateFmt(lead.createdAt) },
          ]}
        />
      </FichaSection>
      <FichaSection title="Origen">
        <PropList
          props={[
            { label: "Canal", value: sourceLabels[lead.source] ?? lead.source },
            { label: "Anuncio", value: ad, href: lead.adSourceUrl ?? undefined, external: true },
            { label: "Llegó del anuncio", value: dateTimeFmt(lead.adReferredAt) },
          ]}
        />
      </FichaSection>
      <FichaSection title="Evaluación">
        <PropList
          props={[
            { label: "Agendada para", value: dateTimeFmt(lead.trialScheduledAt) },
            {
              label: "¿Vino?",
              value: lead.trialAttended == null ? null : lead.trialAttended ? "Sí" : "No",
            },
            ...(lead.stage === "LOST" || lead.stage === "DISQUALIFIED" ? [{ label: "Motivo", value: lead.lostReason }] : []),
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
      <Composer target={{ kind: "lead", id: lead.id }} />
      <div className="mt-4">
        <Timeline items={timeline} labels={TIMELINE_KIND_LABEL} />
      </div>
    </>
  );

  const right = (
    <div className="pb-6">
      <FichaSection title="Etapa del embudo">
        <StageControl leadId={lead.id} stage={lead.stage} />
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
        <PersonTasks open={tasks.open} today={ecuadorDateString()} />
      </FichaSection>
      <FichaSection title="WhatsApp">
        <WhatsappSummary
          conversation={lead.conversation}
          fallback={
            <p className="text-xs text-muted-foreground">
              No escribió al número de WhatsApp de La Cueva. {lead.phone ? "Puedes escribirle desde tu teléfono con el botón WhatsApp." : ""}
            </p>
          }
        />
      </FichaSection>
    </div>
  );

  return <FichaLayout left={left} about={about} center={center} right={right} />;
}
