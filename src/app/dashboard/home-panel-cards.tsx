import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FunnelPanel, SrxfitPanel } from "@/lib/home-panels";

function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}

/**
 * Each number opens the list of those leads (Santiago, 4 oct 2026): `leadsHref`
 * is the Leads list; the filters reproduce the funnel's cut (created this month,
 * counted in every stage passed).
 */
export function FunnelCard({ funnel, href, leadsHref }: { funnel: FunnelPanel; href: string; leadsHref?: string }) {
  const to = (p: Record<string, string>) => (leadsHref ? `${leadsHref}?${new URLSearchParams(p)}` : undefined);
  const steps = [
    { label: "Leads nuevos", value: funnel.leads, href: to({ creado: "mes" }) },
    { label: "Agendaron evaluación", value: funnel.scheduled, href: to({ creado: "mes", embudo: "agendaron" }) },
    { label: "Asistieron", value: funnel.evaluated, href: to({ creado: "mes", embudo: "asistieron" }) },
    { label: "Convertidos", value: funnel.converted, href: to({ creado: "mes", embudo: "convertidos" }) },
  ];
  return (
    <Card className="h-full">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2">
          Embudo comercial
          <Link href={href} className="ml-auto text-xs font-medium text-primary hover:underline">
            Ver →
          </Link>
        </CardTitle>
        <CardDescription>Leads que llegaron este mes y hasta dónde avanzaron.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={s.label} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                {s.href ? (
                  <Link href={s.href} className="hover:underline">
                    {s.label}
                  </Link>
                ) : (
                  <span>{s.label}</span>
                )}
                <span className="tabular-nums">
                  {s.href ? (
                    <Link href={s.href} className="font-semibold underline-offset-2 hover:underline" title={`Ver los ${s.value} leads`}>
                      {s.value}
                    </Link>
                  ) : (
                    <span className="font-semibold">{s.value}</span>
                  )}
                  {i > 0 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{pct(s.value, funnel.leads)}%</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${i === 0 ? (funnel.leads > 0 ? 100 : 0) : pct(s.value, funnel.leads)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Hoy:{" "}
          {leadsHref ? (
            <Link href={to({ creado: "hoy" })!} className="hover:underline">
              {funnel.newToday} lead{funnel.newToday === 1 ? "" : "s"} nuevo{funnel.newToday === 1 ? "" : "s"}
            </Link>
          ) : (
            <>
              {funnel.newToday} lead{funnel.newToday === 1 ? "" : "s"} nuevo{funnel.newToday === 1 ? "" : "s"}
            </>
          )}{" "}
          ·{" "}
          {leadsHref ? (
            <Link href={to({ evaluacion: "hoy" })!} className="hover:underline">
              {funnel.evaluationsToday} evaluaci{funnel.evaluationsToday === 1 ? "ón agendada" : "ones agendadas"}
            </Link>
          ) : (
            <>
              {funnel.evaluationsToday} evaluaci{funnel.evaluationsToday === 1 ? "ón agendada" : "ones agendadas"}
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export function SrxfitCard({
  data,
  links,
}: {
  data: SrxfitPanel;
  links: { prs?: string; seen?: string; plans?: string; app?: string };
}) {
  const stats = [
    {
      label: "PRs registrados",
      value: data.prs.toString(),
      hint: data.prsToValidate > 0 ? `${data.prsToValidate} por validar` : "Validados",
      alert: data.prsToValidate > 0,
      href: links.prs,
    },
    { label: "Evaluadas en nutrición", value: data.nutritionSeen.toString(), hint: "Consultas asistidas", href: links.seen },
    { label: "Planes enviados", value: data.plansSent.toString(), hint: "Publicados en la app", href: links.plans },
    {
      label: "Con la app",
      value: `${data.withApp}/${data.activeSocios}`,
      hint: `${pct(data.withApp, data.activeSocios)}% de los socios`,
      href: links.app,
    },
  ];
  return (
    <Card className="h-full">
      <CardHeader className="pb-0">
        <CardTitle>SRXFIT</CardTitle>
        <CardDescription>Entrenamiento, nutrición y app — este mes.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {stats.map((s) => {
            const body = (
              <div className={`h-full rounded-lg bg-muted/50 p-3 ${s.href ? "transition hover:bg-muted" : ""}`}>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                <p className={`text-xs ${s.alert ? "text-destructive" : "text-muted-foreground"}`}>{s.hint}</p>
              </div>
            );
            return s.href ? (
              <Link key={s.label} href={s.href} className="block">{body}</Link>
            ) : (
              <div key={s.label}>{body}</div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
