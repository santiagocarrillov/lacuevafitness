"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
// No Prisma imports in client components — use plain strings for serializable props.
import {
  getOrCreateTodaySession,
  recordAttendance,
  removeAttendance,
  confirmCoachCount,
} from "@/lib/actions/attendance";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  memberships: { endsAt: Date; state: string }[];
};

type SessionData = Awaited<ReturnType<typeof getOrCreateTodaySession>>;

export function AttendancePanel({
  scheduleId,
  members,
  sede,
}: {
  scheduleId: string;
  members: Member[];
  sede: string;
}) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [search, setSearch] = useState("");
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

  const attendedIds = new Set(session.attendance.map((a) => a.memberId));

  const filtered = members.filter((m) => {
    if (attendedIds.has(m.id)) return false;
    const q = search.toLowerCase();
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q)
    );
  });

  async function handleAddMember(memberId: string) {
    startTransition(async () => {
      const result = await recordAttendance(scheduleId, [memberId]);
      if (result.expiredAlerts.length > 0) {
        toast.warning(`Membresía vencida: ${result.expiredAlerts.join(", ")}`, {
          duration: 8000,
        });
      }
      const s = await getOrCreateTodaySession(scheduleId);
      setSession(s);
      setSearch("");
    });
  }

  async function handleRemoveMember(memberId: string) {
    if (!session) return;
    startTransition(async () => {
      await removeAttendance(session.id, memberId);
      const s = await getOrCreateTodaySession(scheduleId);
      setSession(s);
    });
  }

  async function handleCoachConfirm() {
    if (!session || !coachCount) return;
    startTransition(async () => {
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

  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{session.schedule?.name ?? "Sesión"}</span>
          <Badge variant="outline">
            {session.attendance.length} alumnos
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Add member ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Agregar alumno
          </label>
          <Input
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.length >= 2 && (
            <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
              {filtered.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Sin resultados</p>
              ) : (
                filtered.slice(0, 10).map((m) => {
                  const isExpired =
                    !m.memberships[0] || new Date(m.memberships[0].endsAt) < now;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleAddMember(m.id)}
                      disabled={isPending}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition text-left"
                    >
                      <span>
                        {m.lastName}, {m.firstName}
                      </span>
                      <div className="flex gap-1.5">
                        {isExpired && (
                          <Badge variant="destructive" className="text-xs">
                            Vencida
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {m.status}
                        </Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Attendance list ─────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Registrados ({session.attendance.length})
          </label>
          {session.attendance.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún alumno registrado aún.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {session.attendance.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>
                    {a.member.lastName}, {a.member.firstName}
                  </span>
                  <div className="flex items-center gap-2">
                    {a.expiredMembershipAlert && (
                      <Badge variant="destructive" className="text-xs">
                        Vencida
                      </Badge>
                    )}
                    <button
                      onClick={() => handleRemoveMember(a.memberId)}
                      disabled={isPending}
                      className="text-muted-foreground hover:text-destructive transition text-xs"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* ── Coach confirmation (admin can also trigger) ──────────── */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">
            Confirmación del Coach
          </label>
          {session.coachConfirmation ? (
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={
                  session.discrepancy
                    ? "text-red-600 border-red-300"
                    : "text-emerald-600 border-emerald-300"
                }
              >
                Coach confirmó: {session.coachConfirmation.count}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Admin: {session.attendance.length}
              </span>
              {session.discrepancy && (
                <Badge variant="destructive">Discrepancia</Badge>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="# alumnos"
                value={coachCount}
                onChange={(e) => setCoachCount(e.target.value)}
                className="w-28"
                min={0}
              />
              <Button
                onClick={handleCoachConfirm}
                disabled={isPending || !coachCount}
              >
                Confirmar conteo
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
