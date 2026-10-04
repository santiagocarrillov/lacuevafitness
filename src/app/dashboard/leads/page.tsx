import Link from "next/link";
import { redirect } from "next/navigation";
import { Sede } from "@/generated/prisma/client";
import { getLeads, getLeadStats, getStaffUsers } from "@/lib/actions/leads";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { LEAD_STAGES, STAGE_LABEL } from "@/lib/leads/stages";
import { ACTIVITY_PRESETS, CREATED_PRESETS } from "@/lib/list-filters";
import { FilterBar, Pager, type FilterDef } from "@/components/list/filter-bar";
import { ListHeader, SummaryStrip, ViewTabs } from "@/components/list/list-ui";
import { LeadTable } from "./lead-table";

export const dynamic = "force-dynamic";

const SOURCES = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "WEB_FORM", label: "Formulario web" },
  { value: "PHONE_CALL", label: "Llamada" },
  { value: "WALK_IN", label: "Visita directa" },
  { value: "REFERRAL", label: "Referido" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "OTHER", label: "Otro" },
];

type Params = {
  sede?: string;
  stage?: string;
  source?: string;
  q?: string;
  page?: string;
  creado?: string;
  actividad?: string;
  responsable?: string;
  embudo?: string;
  evaluacion?: string;
};

const FUNNEL_LABEL: Record<string, string> = { agendaron: "Agendaron", asistieron: "Asistieron", convertidos: "Convertidos" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");
  const scopedSede = getSedeScope(user);
  const params = await searchParams;
  const sede = (scopedSede ?? (params.sede as Sede | undefined)) || undefined;

  const [result, stats, staff] = await Promise.all([
    getLeads({
      sede,
      stage: params.stage,
      source: params.source,
      search: params.q,
      created: params.creado,
      activity: params.actividad,
      owner: params.responsable,
      funnel: params.embudo,
      evaluation: params.evaluacion,
      page: parseInt(params.page ?? "1", 10) || 1,
    }),
    getLeadStats(sede),
    getStaffUsers(),
  ]);

  // Saved views: a tab is active when the URL carries exactly its filters.
  const keys: (keyof Params)[] = ["stage", "source", "q", "creado", "actividad", "responsable", "embudo", "evaluacion"];
  const current = Object.fromEntries(keys.filter((k) => params[k]).map((k) => [k, params[k]!]));
  const view = (label: string, p: Record<string, string>) => {
    const same = Object.keys({ ...current, ...p }).every((k) => current[k] === p[k]);
    const qs = new URLSearchParams({ ...(params.sede && !scopedSede ? { sede: params.sede } : {}), ...p }).toString();
    return { label, href: qs ? `/dashboard/leads?${qs}` : "/dashboard/leads", active: same };
  };
  const link = (p: Record<string, string>) => `/dashboard/leads?${new URLSearchParams(p)}`;

  const filters: FilterDef[] = [
    {
      name: "responsable",
      title: "Responsable",
      options: [{ value: "none", label: "Sin asignar" }, ...staff.map((s) => ({ value: s.id, label: s.fullName }))],
    },
    { name: "creado", title: "Fecha de creación", options: CREATED_PRESETS },
    { name: "actividad", title: "Última actividad", options: ACTIVITY_PRESETS },
    { name: "stage", title: "Etapa", multi: true, options: LEAD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] })) },
    {
      name: "embudo",
      title: "Embudo",
      options: Object.entries(FUNNEL_LABEL).map(([value, label]) => ({ value, label: `${label} (o más)` })),
    },
    { name: "source", title: "Canal", multi: true, options: SOURCES },
    {
      name: "evaluacion",
      title: "Evaluación",
      options: [
        { value: "hoy", label: "Agendada para hoy" },
        { value: "proximas", label: "Próximas" },
        { value: "sin_registrar", label: "Pasada, sin registrar si vino" },
      ],
    },
    ...(scopedSede
      ? []
      : [
          {
            name: "sede",
            title: "Sede",
            options: [
              { value: "FITNESS_CENTER", label: "Fitness Center" },
              { value: "XTREME", label: "Xtreme" },
            ],
          },
        ]),
  ];

  return (
    <div className="min-h-full bg-muted/40">
      <ListHeader title="Leads" count={result.total} noun={result.total === 1 ? "registro" : "registros"}>
        <Link
          href="/dashboard/leads/nuevo"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Nuevo lead
        </Link>
      </ListHeader>

      <ViewTabs
        tabs={[
          view("Todos", {}),
          view("Nuevos este mes", { creado: "mes" }),
          view("Por contactar", { stage: "NEW" }),
          view("Agendados", { stage: "SCHEDULED_TRIAL" }),
          view("Negociando", { stage: "NEGOTIATING" }),
          view("Sin actividad 30+ días", { actividad: "sin30" }),
          view("Sin responsable", { responsable: "none" }),
        ]}
      />

      <SummaryStrip
        items={[
          { label: "Total", value: stats.totalLeads, href: "/dashboard/leads" },
          { label: "Este mes", value: stats.thisMonth, href: link({ creado: "mes" }), active: params.creado === "mes" && !params.embudo },
          ...["NEW", "CONTACTED", "SCHEDULED_TRIAL", "TRIAL_ATTENDED", "NEGOTIATING"].map((s) => ({
            label: STAGE_LABEL[s as keyof typeof STAGE_LABEL],
            value: stats.stages[s] ?? 0,
            href: link({ stage: s }),
            active: params.stage === s,
          })),
          { label: "Conversión", value: `${stats.conversionRate}%`, hint: `${stats.stages.CONVERTED ?? 0} socios`, href: link({ stage: "CONVERTED" }) },
          { label: "Perdidos", value: stats.lost, href: link({ stage: "LOST" }), active: params.stage === "LOST" },
        ]}
      />

      <div className="border-t border-border bg-card">
        <FilterBar filters={filters} searchPlaceholder="Buscar nombre, correo, teléfono" />
        <LeadTable leads={result.leads} />
        <Pager page={result.page} totalPages={result.totalPages} total={result.total} noun="leads" />
      </div>
    </div>
  );
}
