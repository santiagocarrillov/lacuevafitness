"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AttendancePanel } from "./attendance-panel";
import { CoachPanel } from "./coach-panel";

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
  userRole,
}: {
  schedules: Schedule[];
  members: Member[];
  sede: string;
  userRole: string;
}) {
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  if (schedules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No hay clases programadas para hoy.</p>
    );
  }

  const isCoach = userRole === "COACH";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {schedules.map((s) => (
          <Card
            key={s.scheduleId}
            className={`cursor-pointer transition ${
              selectedScheduleId === s.scheduleId
                ? "ring-2 ring-primary"
                : "hover:bg-accent"
            }`}
            onClick={() => setSelectedScheduleId(s.scheduleId)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{s.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <span className="text-2xl font-bold">
                {s.attendanceCount}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {s.coachConfirmed ? (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                    Coach: {s.coachCount}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
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
        isCoach ? (
          <CoachPanel scheduleId={selectedScheduleId} />
        ) : (
          <AttendancePanel
            scheduleId={selectedScheduleId}
            members={members}
            sede={sede}
          />
        )
      )}
    </div>
  );
}
