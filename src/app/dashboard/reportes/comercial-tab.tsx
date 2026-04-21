import { Sede } from "@/generated/prisma/client";
import { getCommercialReport } from "@/lib/actions/reports";
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
  year,
  month,
}: {
  sede?: Sede;
  year: number;
  month: number;
}) {
  const data = await getCommercialReport(sede, year, month);

  const totalLeads = data.sources.reduce((s, x) => s + x.count, 0);
  const totalConverted = data.sources.reduce((s, x) => s + x.converted, 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total leads</CardDescription>
            <CardTitle className="text-3xl">{totalLeads}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Convertidos</CardDescription>
            <CardTitle className="text-3xl">{totalConverted}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tasa conversión global</CardDescription>
            <CardTitle className="text-3xl">
              {totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0}%
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Leads por canal</CardTitle>
            <CardDescription>Conversión por fuente de origen</CardDescription>
          </CardHeader>
          <CardContent>
            {data.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin leads este mes.</p>
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
            <CardDescription>Leads del mes por etapa</CardDescription>
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
