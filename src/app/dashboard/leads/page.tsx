import { Sede } from "@/generated/prisma/client";
import { getLeads, getLeadStats } from "@/lib/actions/leads";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LeadTable } from "./lead-table";
import { LeadFilters } from "./lead-filters";
import { NewLeadButton } from "./new-lead-button";

export const dynamic = "force-dynamic";

const stageLabels: Record<string, string> = {
  NEW: "Nuevos",
  CONTACTED: "Contactados",
  SCHEDULED_TRIAL: "C.P. agendada",
  TRIAL_ATTENDED: "C.P. asistió",
  TRIAL_NO_SHOW: "C.P. no asistió",
  NEGOTIATING: "Negociando",
  CONVERTED: "Convertidos",
  LOST: "Perdidos",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ sede?: string; stage?: string; source?: string; q?: string; page?: string }>;
}) {
  const user = await requireAuth();
  if (!can.manageLeads(user)) redirect("/dashboard?forbidden=1");
  const scopedSede = getSedeScope(user);

  const params = await searchParams;
  const sede = (scopedSede ?? (params.sede as Sede | undefined)) || undefined;
  const stage = params.stage as any;
  const source = params.source as any;
  const search = params.q;
  const page = parseInt(params.page ?? "1", 10);

  const [result, stats] = await Promise.all([
    getLeads({ sede, stage, source, search, page }),
    getLeadStats(sede),
  ]);

  const pipelineStages = [
    "NEW", "CONTACTED", "SCHEDULED_TRIAL", "TRIAL_ATTENDED", "NEGOTIATING", "CONVERTED",
  ];

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Leads y Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Seguimiento de prospectos — desde el primer contacto hasta la inscripción.
          </p>
        </div>
        <NewLeadButton />
      </header>

      {/* Pipeline funnel */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Pipeline de ventas</h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {pipelineStages.map((s) => (
            <Card key={s} className="min-w-[140px] flex-shrink-0">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardDescription className="text-xs">
                  {stageLabels[s] ?? s}
                </CardDescription>
                <CardTitle className="text-2xl">
                  {stats.stages[s] ?? 0}
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Stats row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total leads</CardDescription>
            <CardTitle className="text-2xl">{stats.totalLeads}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Este mes</CardDescription>
            <CardTitle className="text-2xl">{stats.thisMonth}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tasa de conversión</CardDescription>
            <CardTitle className="text-2xl">{stats.conversionRate}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Perdidos</CardDescription>
            <CardTitle className="text-2xl">{stats.lost}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {stats.totalLeads > 0
              ? `${Math.round((stats.lost / stats.totalLeads) * 100)}% del total`
              : "—"}
          </CardContent>
        </Card>
      </section>

      <LeadFilters
        currentSede={sede}
        currentStage={stage}
        currentSource={source}
        currentSearch={search}
      />

      <LeadTable
        leads={result.leads}
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
      />
    </div>
  );
}
