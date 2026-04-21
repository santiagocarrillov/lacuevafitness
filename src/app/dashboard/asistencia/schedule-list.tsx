"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sede } from "@/generated/prisma/client";
import { AttendancePanel } from "./attendance-panel";

type Schedule = {
  scheduleId: string;
  name: string;
  startTime: string;
  capacity: number;
  sessionId: string | null;
  attendanceCount: number;
  coachConfirmed: boolean;
  coachCount: number | null;
  discrepancy: boolean;
};

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
  memberships: { endsAt: Date; state: string }[];
};

export function ScheduleList({
  schedules,
  members,
  sede,
}: {
  schedules: Schedule[];
  members: Member[];
  sede: Sede;
}) {
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  if (schedules.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No hay clases programadas para hoy.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {schedules.map((s) => (
          <Card
            key={s.scheduleId}
            className={`cursor-pointer transition border-zinc-800 ${
              selectedScheduleId === s.scheduleId
                ? "bg-zinc-800 border-zinc-600"
                : "bg-zinc-900 hover:bg-zinc-800/70"
            }`}
            onClick={() => setSelectedScheduleId(s.scheduleId)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-zinc-50">{s.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-2xl font-bold text-zinc-50">
                  {s.attendanceCount}
                </span>
                <span className="text-zinc-500">/ {s.capacity}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.coachConfirmed ? (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                    Coach: {s.coachCount}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-zinc-500 border-zinc-700">
                    Sin confirmar
                  </Badge>
                )}
                {s.discrepancy && (
                  <Badge variant="destructive">Discrepancia</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedScheduleId && (
        <AttendancePanel
          scheduleId={selectedScheduleId}
          members={members}
          sede={sede}
        />
      )}
    </div>
  );
}
