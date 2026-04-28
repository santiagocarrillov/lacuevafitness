import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import { getCommercialReport, getCommercialPipeline } from "@/lib/actions/reports";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DailyLeadsChart } from "./daily-leads-chart";

const sourceLabels: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  PHONE_CALL: "Llamada",
  WEB_FORM: "Web",
  WALK_IN: "Visita directa",
  REFERRAL: "Referido",
  TIKTOK: "TikTok",
  OTHER: "Otro",
};

const stageLabels: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  SCHEDULED_TRIAL: "C.P. agendada",
  TRIAL_ATTENDED: "C.P. asistió",
  TRIAL_NO_SHOW: "No asistió",
  NEGOTIATING: "Negociando",
  CONVERTED: "Convertido",
  LOST: "Perdido",
};

export async function ComercialTab({
  sede,
  from,
  to,
  buildUrl,
}: {
  sede?: Sede;
  from: string;
  to: string;
  buildUrl: (updates: Record<string, string>) => string;
}) {
  const [data, pipeline] = await Promise.all([
    getCommercialReport(sede, from, to),
    getCommercialPipeline(sede, from, to),
  ]);

  const { totalLeads, evaluaciones, convertidos, leadsToEvaluacionesPct, leadsToConvertidosPct, evaluacionesToConvertidosPct } = pipeline;

  return (
    <div className="space-y-6">
      {/* Pipeline funnel */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium bg-purple-50 text-purple-900 px-3 py-1.5 rounded">
          Pipeline comercial
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href={buildUrl({ detail: "leads" })} className="block hover:opacity-80 transition">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Leads</CardDescription>
                <CardTitle className="text-3xl">{totalLeads}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                leads del período
              </CardContent>
            </Card>
          </Link>
          <Link href={buildUrl({ detail: "evaluaciones" })} className="block hover:opacity-80 transition">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Evaluaciones</CardDescription>
                <CardTitle className="text-3xl">
                  {evaluaciones}
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    ({leadsToEvaluacionesPct}%)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                de leads
              </CardContent>
            </Card>
          </Link>
          <Link href={buildUrl({ detail: "convertidos" })} className="block hover:opacity-80 transition">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Convertidos</CardDescription>
                <CardTitle className="text-3xl">
                  {convertidos}
                  <span className="text-base font-normal text-muted-foreground ml-2">
                    ({leadsToConvertidosPct}%)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                de leads · {evaluacionesToConvertidosPct}% de evaluaciones
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Conversion funnel bars */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-32 text-muted-foreground">Leads → Evalúan</span>
            <div className="flex-1 bg-muted rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: `${leadsToEvaluacionesPct}%` }}
              />
            </div>
            <span className="w-10 text-right font-medium">{leadsToEvaluacionesPct}%</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-32 text-muted-foreground">Evalúan → Cierran</span>
            <div className="flex-1 bg-muted rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full"
                style={{ width: `${evaluacionesToConvertidosPct}%` }}
              />
            </div>
            <span className="w-10 text-right font-medium">{evaluacionesToConvertidosPct}%</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-32 text-muted-foreground">Leads → Cierran</span>
            <div className="flex-1 bg-muted rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full"
                style={{ width: `${leadsToConvertidosPct}%` }}
              />
            </div>
            <span className="w-10 text-right font-medium">{leadsToConvertidosPct}%</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Leads por canal</CardTitle>
            <CardDescription>Conversión por fuente de origen</CardDescription>
          </CardHeader>
          <CardContent>
            {data.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin leads en el período.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {data.sources
                  .sort((a, b) => b.count - a.count)
                  .map((s) => (
                    <div key={s.source} className="flex items-center justify-between py-1 border-b last:border-0">
                      <span>{sourceLabels[s.source] ?? s.source}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{s.count} leads</Badge>
                        <Badge variant="outline" className={
                          s.conversionRate >= 30 ? "text-emerald-700 border-emerald-200" :
                          s.conversionRate >= 10 ? "text-amber-700 border-amber-200" :
                          "text-red-700 border-red-200"
                        }>
                          {s.converted} conv. ({s.conversionRate}%)
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado del pipeline</CardTitle>
            <CardDescription>Leads del período por etapa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {data.stages
                .sort((a, b) => b.count - a.count)
                .map((s) => (
                  <div key={s.stage} className="flex items-center justify-between py-1 border-b last:border-0">
                    <span>{stageLabels[s.stage] ?? s.stage}</span>
                    <Badge variant="outline">{s.count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {data.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Leads por día</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <DailyLeadsChart data={data.daily} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
