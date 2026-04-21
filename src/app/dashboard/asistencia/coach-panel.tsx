"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getOrCreateTodaySession,
  confirmCoachCount,
} from "@/lib/actions/attendance";

type SessionData = Awaited<ReturnType<typeof getOrCreateTodaySession>>;

export function CoachPanel({ scheduleId }: { scheduleId: string }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [coachCount, setCoachCount] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const s = await getOrCreateTodaySession(scheduleId);
      setSession(s);
    });
  }, [scheduleId]);

  if (!session) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Cargando sesión…
        </CardContent>
      </Card>
    );
  }

  async function handleConfirm() {
    if (!session || !coachCount) return;
    startTransition(async () => {
      // TODO: use actual coach user ID from auth
      const result = await confirmCoachCount(
        session.id,
        "coach-placeholder",
        parseInt(coachCount, 10),
      );
      if (result.discrepancy) {
        toast.error(
          `Discrepancia: Admin registró ${result.adminCount}, Coach confirmó ${result.coachCount}`,
          { duration: 10000 },
        );
      } else {
        toast.success("Coach confirmó. Sin discrepancias.");
      }
      const s = await getOrCreateTodaySession(scheduleId);
      setSession(s);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{session.schedule?.name ?? "Sesión"} — Confirmación</span>
          <Badge variant="outline">
            Admin registró: {session.attendance.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {session.coachConfirmation ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Ya confirmaste esta clase.</p>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={
                  session.discrepancy
                    ? "text-red-600 border-red-300"
                    : "text-emerald-600 border-emerald-300"
                }
              >
                Tu conteo: {session.coachConfirmation.count}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Admin: {session.attendance.length}
              </span>
              {session.discrepancy && (
                <Badge variant="destructive">Discrepancia</Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ¿Cuántos alumnos hubo en esta clase?
            </p>
            <div className="flex gap-2 max-w-xs">
              <Input
                type="number"
                placeholder="# alumnos"
                value={coachCount}
                onChange={(e) => setCoachCount(e.target.value)}
                className="w-28"
                min={0}
              />
              <Button
                onClick={handleConfirm}
                disabled={isPending || !coachCount}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
