"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sede } from "@/generated/prisma/client";
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
  sede: Sede;
}) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [search, setSearch] = useState("");
  const [coachCount, setCoachCount] = useState("");
  const [isPending, startTransition] = useTransition();

  // Load session on mount / when scheduleId changes
  useEffect(() => {
    startTransition(async () => {
      const s = await getOrCreateTodaySession(scheduleId);
      setSession(s);
    });
  }, [scheduleId]);

  if (!session) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="py-8 text-center text-zinc-500">
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
        toast.warning(`⚠️ Membresía vencida: ${result.expiredAlerts.join(", ")}`, {
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
      // TODO: use actual coach user ID from auth
      const result = await confirmCoachCount(
        session.id,
        "coach-placeholder",
        parseInt(coachCount, 10),
      );
      if (result.discrepancy) {
        toast.error(
          `🚨 Discrepancia: Admin registró ${result.adminCount}, Coach confirmó ${result.coachCount}`,
          { duration: 10000 },
        );
      } else {
        toast.success("✅ Coach confirmó. Sin discrepancias.");
      }
      const s = await getOrCreateTodaySession(scheduleId);
      setSession(s);
    });
  }

  const now = new Date();

  return (
    <Card className="bg-zinc-900 border-zinc-800 text-zinc-50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{session.schedule?.name ?? "Sesión"}</span>
          <Badge variant="outline" className="text-zinc-400 border-zinc-700">
            {session.attendance.length} alumnos
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Add member ─────────────────────────────────────────── */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">
            Agregar alumno
          </label>
          <Input
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-zinc-800 border-zinc-700 text-zinc-50"
          />
          {search.length >= 2 && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-700 divide-y divide-zinc-800">
              {filtered.length === 0 ? (
                <p className="p-3 text-sm text-zinc-500">Sin resultados</p>
              ) : (
                filtered.slice(0, 10).map((m) => {
                  const isExpired =
                    !m.memberships[0] || new Date(m.memberships[0].endsAt) < now;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleAddMember(m.id)}
                      disabled={isPending}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-zinc-800 transition text-left"
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
                        <Badge
                          variant="outline"
                          className="text-xs text-zinc-500 border-zinc-700"
                        >
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
          <label className="text-sm font-medium text-zinc-400">
            Registrados ({session.attendance.length})
          </label>
          {session.attendance.length === 0 ? (
            <p className="text-sm text-zinc-500">Ningún alumno registrado aún.</p>
          ) : (
            <div className="rounded-md border border-zinc-700 divide-y divide-zinc-800">
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
                        ⚠ Vencida
                      </Badge>
                    )}
                    <button
                      onClick={() => handleRemoveMember(a.memberId)}
                      disabled={isPending}
                      className="text-zinc-500 hover:text-red-400 transition text-xs"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator className="bg-zinc-800" />

        {/* ── Coach confirmation ───────────────────────────────────── */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-zinc-400">
            Confirmación del Coach
          </label>
          {session.coachConfirmation ? (
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={
                  session.discrepancy
                    ? "text-red-400 border-red-400/30"
                    : "text-emerald-400 border-emerald-400/30"
                }
              >
                Coach confirmó: {session.coachConfirmation.count}
              </Badge>
              <span className="text-sm text-zinc-500">
                Admin: {session.attendance.length}
              </span>
              {session.discrepancy && (
                <Badge variant="destructive">🚨 Discrepancia</Badge>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="# alumnos"
                value={coachCount}
                onChange={(e) => setCoachCount(e.target.value)}
                className="w-28 bg-zinc-800 border-zinc-700 text-zinc-50"
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
