import { getChallenges, getMetricLeaderboard } from "@/lib/actions/challenges";
import { isMetricRule, type MetricLeaderboard } from "@/lib/challenges/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TEST_LABELS } from "@/lib/portal/test-labels";
import { NewChallengeButton } from "./new-challenge-button";
import { EditChallengeDialog } from "./edit-challenge-dialog";
import { RecalcButton } from "./recalc-button";

export const dynamic = "force-dynamic";

const ruleLabels: Record<string, string> = {
  TOTAL_CLASSES: "clases totales",
  CONSECUTIVE_CLASSES: "clases consecutivas",
  CLASSES_IN_DAYS: "clases en X días",
};

const metricRuleLabels: Record<string, string> = {
  WEIGHT_LOSS: "Mayor pérdida de peso",
  WAIST_LOSS: "Mayor reducción de cintura",
  TEST_IMPROVEMENT: "Mayor mejora en marcas",
};

// Intuitive display: weight/waist improve going DOWN, test marks go UP; green = good.
function formatScore(ruleType: string, score: number, unit: "lb" | "%") {
  const good = score > 0;
  if (ruleType === "TEST_IMPROVEMENT") {
    return { text: `${score > 0 ? "+" : ""}${score.toFixed(1)}%`, good };
  }
  const sign = score > 0 ? "−" : "+";
  const mag = Math.abs(score).toFixed(1);
  return { text: `${sign}${mag}${unit === "lb" ? " lb" : "%"}`, good };
}

function metricSummary(c: {
  ruleType: string;
  ruleTarget: number | null;
  metricTest: string | null;
  startsAt: Date;
  endsAt: Date;
}) {
  const parts: string[] = [metricRuleLabels[c.ruleType] ?? "Ranking"];
  if (c.ruleType === "TEST_IMPROVEMENT") {
    parts.push(c.metricTest ? TEST_LABELS[c.metricTest as keyof typeof TEST_LABELS].label : "todos los ejercicios");
  }
  if (c.ruleTarget != null) {
    const unit = c.ruleType === "WEIGHT_LOSS" ? "lb" : "%";
    parts.push(`meta mínima ${c.ruleTarget}${unit === "lb" ? " lb" : "%"}`);
  }
  return parts.join(" · ");
}

export default async function RetosPage() {
  const challenges = await getChallenges(true);

  // Metric challenges compute a live leaderboard from SRXFIT data.
  const leaderboards = new Map<string, MetricLeaderboard>();
  await Promise.all(
    challenges
      .filter((c) => isMetricRule(c.ruleType))
      .map(async (c) => {
        leaderboards.set(c.id, await getMetricLeaderboard(c));
      }),
  );

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Retos</h1>
          <p className="text-sm text-muted-foreground">
            Gamificación — asistencia y progreso SRXFIT con recompensas para socios.
          </p>
        </div>
        <NewChallengeButton />
      </header>

      {challenges.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay retos creados. Crea el primero con el botón de arriba.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {challenges.map((c) => {
            const now = new Date();
            const isActive = c.active && new Date(c.startsAt) <= now && new Date(c.endsAt) >= now;
            const metric = isMetricRule(c.ruleType);
            const lb = metric ? leaderboards.get(c.id) : undefined;

            return (
              <Card key={c.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{c.name}</CardTitle>
                      <CardDescription>{c.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Activo</Badge>
                      ) : (
                        <Badge variant="outline">Finalizado</Badge>
                      )}
                      {c.reward && <Badge variant="outline">Premio: {c.reward}</Badge>}
                      {!metric && <RecalcButton challengeId={c.id} />}
                      <EditChallengeDialog challenge={c} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {metric ? (
                    <>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="font-medium">{metricSummary(c)}</span>
                        <span className="text-muted-foreground">
                          {new Date(c.startsAt).toLocaleDateString("es-EC")} — {new Date(c.endsAt).toLocaleDateString("es-EC")}
                        </span>
                        {lb && lb.missing > 0 && (
                          <span className="text-muted-foreground">{lb.missing} sin datos suficientes</span>
                        )}
                      </div>

                      {!lb || lb.entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground rounded-md border px-3 py-2">
                          Aún no hay datos SRXFIT suficientes en el período para armar el ranking.
                        </p>
                      ) : (
                        <div className="rounded-md border">
                          <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground flex justify-between">
                            <span>Ranking</span>
                            <span>Progreso</span>
                          </div>
                          {lb.entries.slice(0, 10).map((e, i) => {
                            const s = formatScore(c.ruleType, e.score, lb.unit);
                            const detailUnit =
                              c.ruleType === "WEIGHT_LOSS"
                                ? "lb"
                                : c.ruleType === "WAIST_LOSS"
                                  ? "cm"
                                  : c.metricTest
                                    ? TEST_LABELS[c.metricTest as keyof typeof TEST_LABELS].unit
                                    : "";
                            return (
                              <div key={e.memberId} className="flex items-center justify-between px-3 py-2 border-t text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground w-5">{i + 1}.</span>
                                  <span>{e.name}</span>
                                  {e.meets && (
                                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                                      Cumplió meta
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  {e.baseline != null && e.latest != null && (
                                    <span className="text-xs text-muted-foreground">
                                      {e.baseline} → {e.latest} {detailUnit}
                                    </span>
                                  )}
                                  <span className={`text-sm font-medium tabular-nums ${s.good ? "text-emerald-600" : "text-muted-foreground"}`}>
                                    {s.text}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <AttendanceBody c={c} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Attendance challenges: stored progress leaderboard (unchanged behavior).
function AttendanceBody({
  c,
}: {
  c: Awaited<ReturnType<typeof getChallenges>>[number];
}) {
  const target = c.ruleTarget ?? 0;
  const completed = c.progress.filter((p) => p.completed).length;
  const enrolled = c.progress.length;

  return (
    <>
      <div className="flex gap-4 text-sm">
        <span>Meta: <strong>{target} {ruleLabels[c.ruleType]}</strong></span>
        {c.ruleDays && <span>en <strong>{c.ruleDays} días</strong></span>}
        <span>Inscritos: <strong>{enrolled}</strong></span>
        <span>Completaron: <strong>{completed}</strong></span>
        <span className="text-muted-foreground">
          {new Date(c.startsAt).toLocaleDateString("es-EC")} — {new Date(c.endsAt).toLocaleDateString("es-EC")}
        </span>
      </div>

      {c.progress.length > 0 && (
        <div className="rounded-md border">
          <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground flex justify-between">
            <span>Ranking</span>
            <span>Progreso</span>
          </div>
          {c.progress.slice(0, 10).map((p, i) => {
            const pct = Math.min(100, Math.round((p.currentCount / Math.max(target, 1)) * 100));
            return (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 border-t text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-5">{i + 1}.</span>
                  <span>{p.member.firstName} {p.member.lastName}</span>
                  {p.completed && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                      Completado
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-muted rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${p.completed ? "bg-emerald-500" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {p.currentCount}/{target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
