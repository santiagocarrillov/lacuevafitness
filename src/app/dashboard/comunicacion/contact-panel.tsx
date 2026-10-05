"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bot, ExternalLink, Hand, Mail, Phone } from "lucide-react";
import { getContactSummary, type ContactSummary, type ThreadData } from "@/lib/actions/comunicacion";
import { getPersonTasks } from "@/lib/actions/staff-tasks";
import { ecuadorDateString } from "@/lib/timezone";
import type { TaskListItem } from "@/lib/tasks/meta";
import { PersonTaskList } from "@/components/tasks/person-task-list";
import { RESUME_PRESETS, formatResumeAt, type ResumePreset } from "@/lib/whatsapp/bot-handoff";
import { LEAD_STAGES, MEMBER_OWNED_STAGES, MEMBER_STATUS_COLOR, MEMBER_STATUS_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/leads/stages";
import { SEDE_LABEL } from "./format";
import { Avatar } from "./ui";

const SOURCE: Record<string, string> = {
  INSTAGRAM: "Instagram", FACEBOOK: "Facebook", WHATSAPP: "WhatsApp", PHONE_CALL: "Llamada",
  WEB_FORM: "Formulario web", WALK_IN: "Visita", REFERRAL: "Referido", TIKTOK: "TikTok", OTHER: "Otro",
};

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guayaquil" });
const dateTimeFmt = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" });

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

/**
 * Right-hand card of the inbox ("smart card"): who the person is and what we
 * control from here — stage, owner, bot — plus their latest notes. The full
 * ficha is one click away.
 */
export function ContactPanel({
  thread,
  refreshKey,
  staff,
  currentUserId,
  pending,
  onStage,
  onAssign,
  onTakeOver,
  onResume,
  onSchedule,
  onNewTask,
  onTasksChanged,
}: {
  thread: ThreadData;
  refreshKey: number;
  staff: { id: string; name: string }[];
  currentUserId: string;
  pending: boolean;
  onStage: (leadId: string, stage: string) => void;
  onAssign: (leadId: string, userId: string | null) => void;
  onTakeOver: () => void;
  onResume: () => void;
  onSchedule: (preset: ResumePreset) => void;
  /** Opens the "Tarea" tab of the composer, under the chat. */
  onNewTask: () => void;
  onTasksChanged: () => void;
}) {
  const [summary, setSummary] = useState<ContactSummary | null>(null);
  const [loadedTasks, setLoadedTasks] = useState<{ personId: string; open: TaskListItem[]; closed: TaskListItem[] } | null>(null);
  const id = thread.conversationId;
  const personKind = thread.contactKind === "member" && thread.memberId ? "member" : thread.leadId ? "lead" : null;
  const personId = personKind === "member" ? thread.memberId : personKind === "lead" ? thread.leadId : null;
  // Never show the previous conversation's tasks while the new ones load.
  const tasks = loadedTasks && loadedTasks.personId === personId ? loadedTasks : null;

  // The person's tasks live here, next to the chat: open ones close in place.
  useEffect(() => {
    let alive = true;
    if (!personKind || !personId) return;
    getPersonTasks({ kind: personKind, id: personId }, 3)
      .then((t) => alive && setLoadedTasks({ personId, ...t }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [personKind, personId, refreshKey]);

  useEffect(() => {
    let alive = true;
    getContactSummary(id)
      .then((s) => alive && setSummary(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, refreshKey]);

  const s = summary && summary.name ? summary : null;
  const fichaHref = s?.memberId ? `/dashboard/socios/${s.memberId}` : s?.leadId ? `/dashboard/leads/${s.leadId}` : null;

  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card xl:flex">
      <div className="flex items-start gap-3 border-b border-border px-4 py-4">
        <Avatar name={thread.contactName} size={44} />
        <div className="min-w-0 flex-1">
          {fichaHref ? (
            <Link href={fichaHref} className="block truncate font-semibold hover:underline">
              {thread.contactName}
            </Link>
          ) : (
            <p className="truncate font-semibold">{thread.contactName}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {thread.contactKind === "member" || thread.memberStatus ? "Socio" : "Lead"} · {SEDE_LABEL[thread.sede] ?? thread.sede}
          </p>
          {fichaHref && (
            <Link href={fichaHref} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Abrir ficha <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
      </div>

      <Section title="Contacto">
        <div className="space-y-1.5 text-sm">
          {thread.contactPhone && (
            <a href={`tel:${thread.contactPhone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 hover:underline">
              <Phone className="size-3.5 text-muted-foreground" /> {thread.contactPhone}
            </a>
          )}
          {s?.email && (
            <a href={`mailto:${s.email}`} className="flex items-center gap-2 truncate hover:underline">
              <Mail className="size-3.5 shrink-0 text-muted-foreground" /> <span className="truncate">{s.email}</span>
            </a>
          )}
        </div>
      </Section>

      <Section title="Etapa y responsable">
        <div className="space-y-2">
          {thread.memberStatus || !thread.leadId ? (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${thread.memberStatus ? MEMBER_STATUS_COLOR[thread.memberStatus] : ""}`}
              title="Es socio: su estado lo manda su membresía"
            >
              {thread.memberStatus ? MEMBER_STATUS_LABEL[thread.memberStatus] : "Socio"}
            </span>
          ) : (
            <select
              value={thread.stage ?? "NEW"}
              disabled={pending}
              onChange={(e) => onStage(thread.leadId!, e.target.value)}
              className={`h-8 w-full rounded-md border px-2 text-xs font-medium ${thread.stage ? STAGE_COLOR[thread.stage] : ""}`}
              aria-label="Etapa del embudo"
            >
              {LEAD_STAGES.map((st) => (
                <option key={st} value={st} disabled={MEMBER_OWNED_STAGES.includes(st)}>
                  {STAGE_LABEL[st]}
                  {MEMBER_OWNED_STAGES.includes(st) ? " (desde la ficha)" : ""}
                </option>
              ))}
            </select>
          )}
          <select
            value={thread.ownerUserId ?? "unassigned"}
            disabled={pending || !thread.leadId}
            onChange={(e) => thread.leadId && onAssign(thread.leadId, e.target.value === "unassigned" ? null : e.target.value)}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            aria-label="Responsable"
            title={thread.leadId ? "Responsable" : "Los socios no tienen responsable de venta"}
          >
            <option value="unassigned">Sin responsable</option>
            {!staff.some((u) => u.id === currentUserId) && <option value={currentUserId}>Asignarme a mí</option>}
            {staff.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id === currentUserId ? `${u.name} (yo)` : u.name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="Quién responde">
        {thread.botPaused ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs">
              <Hand className="size-3.5 text-amber-600" /> La atiende el equipo
              {thread.botResumeAt && <span className="text-muted-foreground">· bot {formatResumeAt(thread.botResumeAt)}</span>}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onResume}
                disabled={pending}
                className="h-8 flex-1 rounded-md bg-teal-600 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Devolver al bot
              </button>
              <select
                value=""
                disabled={pending}
                onChange={(e) => e.target.value && onSchedule(e.target.value as ResumePreset)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                title="Programar la devolución al bot"
              >
                <option value="">Más tarde…</option>
                {RESUME_PRESETS.filter((r) => r.value !== "now").map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs">
              <Bot className="size-3.5 text-teal-600" /> Responde el agente IA
            </p>
            <button
              type="button"
              onClick={onTakeOver}
              disabled={pending}
              className="h-8 w-full rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Tomar control
            </button>
          </div>
        )}
      </Section>

      {s && (
        <Section title={s.kind === "member" ? "Membresía" : "Origen"}>
          {s.kind === "member" ? (
            <>
              <Row label="Plan">{s.membership ? s.membership.plan : "--"}</Row>
              <Row label={s.membership?.active ? "Vence" : "Venció"}>
                <span className={s.membership && !s.membership.active ? "font-medium text-destructive" : ""}>
                  {s.membership ? dateFmt(s.membership.endsAt) : "--"}
                </span>
              </Row>
              <Row label="Última asistencia">{s.lastAttendanceAt ? dateFmt(s.lastAttendanceAt) : "Nunca"}</Row>
              <Row label="Socio desde">{dateFmt(s.createdAt)}</Row>
            </>
          ) : (
            <>
              <Row label="Canal">{s.source ? SOURCE[s.source] ?? s.source : "--"}</Row>
              {s.adHeadline && <Row label="Anuncio">{s.adHeadline}</Row>}
              <Row label="Evaluación">{s.trialScheduledAt ? dateTimeFmt(s.trialScheduledAt) : "Sin agendar"}</Row>
              <Row label="Llegó">{dateFmt(s.createdAt)}</Row>
            </>
          )}
        </Section>
      )}

      {personId && (
        <Section
          title={tasks && tasks.open.length > 0 ? `Tareas (${tasks.open.length})` : "Tareas"}
          action={
            <button type="button" onClick={onNewTask} className="text-xs font-medium text-primary hover:underline">
              + Tarea
            </button>
          }
        >
          {tasks ? (
            <PersonTaskList
              open={tasks.open}
              closed={tasks.closed}
              meId={currentUserId}
              today={ecuadorDateString()}
              onChanged={onTasksChanged}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          )}
        </Section>
      )}

      {s && (
        <Section title="Notas">
          {s.notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin notas. Escribe una en “Nota interna”, abajo del chat.</p>
          ) : (
            <ul className="space-y-2">
              {s.notes.map((n) => (
                <li key={n.id} className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs">
                  <p className="whitespace-pre-line break-words">{n.text}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {n.by ? `${n.by} · ` : ""}
                    {dateTimeFmt(n.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </aside>
  );
}
