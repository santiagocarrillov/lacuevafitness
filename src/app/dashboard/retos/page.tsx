import { getChallenges } from "@/lib/actions/challenges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewChallengeButton } from "./new-challenge-button";

export const dynamic = "force-dynamic";

const ruleLabels: Record<string, string> = {
  TOTAL_CLASSES: "clases totales",
  CONSECUTIVE_CLASSES: "clases consecutivas",
  CLASSES_IN_DAYS: "clases en X días",
};

export default async function RetosPage() {
  const challenges = await getChallenges(false);

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Retos</h1>
          <p className="text-sm text-muted-foreground">
            Gamificación — retos de asistencia con recompensas para socios.
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
            const completed = c.progress.filter((p) => p.completed).length;
            const enrolled = c.progress.length;

            return (
              <Card key={c.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{c.name}</CardTitle>
                      <CardDescription>{c.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Activo</Badge>
                      ) : (
                        <Badge variant="outline">Finalizado</Badge>
                      )}
                      {c.reward && <Badge variant="outline">Premio: {c.reward}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-4 text-sm">
                    <span>Meta: <strong>{c.ruleTarget} {ruleLabels[c.ruleType]}</strong></span>
                    {c.ruleDays && <span>en <strong>{c.ruleDays} días</strong></span>}
                    <span>Inscritos: <strong>{enrolled}</strong></span>
                    <span>Completaron: <strong>{completed}</strong></span>
                    <span className="text-muted-foreground">
                      {new Date(c.startsAt).toLocaleDateString("es-EC")} — {new Date(c.endsAt).toLocaleDateString("es-EC")}
                    </span>
                  </div>

                  {/* Leaderboard */}
                  {c.progress.length > 0 && (
                    <div className="rounded-md border">
                      <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground flex justify-between">
                        <span>Ranking</span>
                        <span>Progreso</span>
                      </div>
                      {c.progress.slice(0, 10).map((p, i) => {
                        const pct = Math.min(100, Math.round((p.currentCount / c.ruleTarget) * 100));
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
                                {p.currentCount}/{c.ruleTarget}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
