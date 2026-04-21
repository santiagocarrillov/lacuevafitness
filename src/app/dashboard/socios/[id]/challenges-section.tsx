"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ChallengeProgress = {
  id: string;
  currentCount: number;
  completed: boolean;
  completedAt: Date | null;
  challenge: {
    name: string;
    description: string | null;
    reward: string | null;
    ruleTarget: number;
    startsAt: Date;
    endsAt: Date;
  };
};

export function ChallengesSection({
  challenges,
}: {
  challenges: ChallengeProgress[];
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Retos activos</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {challenges.map((cp) => {
            const pct = Math.min(100, Math.round((cp.currentCount / cp.challenge.ruleTarget) * 100));
            return (
              <div key={cp.id} className="p-3 rounded-md border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{cp.challenge.name}</p>
                    {cp.challenge.description && (
                      <p className="text-xs text-muted-foreground">{cp.challenge.description}</p>
                    )}
                  </div>
                  {cp.completed ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                      Completado
                    </Badge>
                  ) : (
                    <Badge variant="outline">{cp.currentCount} / {cp.challenge.ruleTarget}</Badge>
                  )}
                </div>
                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${cp.completed ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{pct}% completado</span>
                  {cp.challenge.reward && <span>Premio: {cp.challenge.reward}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
