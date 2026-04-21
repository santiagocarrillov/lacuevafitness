import { Sede, UserRole } from "@/generated/prisma/client";
import { getTodaySchedules, getActiveMembers } from "@/lib/actions/attendance";
import { ScheduleList } from "./schedule-list";

export const dynamic = "force-dynamic";

export default async function AsistenciaPage() {
  // TODO: derive role and sede from logged-in user via Supabase Auth.
  // For now, default to ADMIN (full panel). Coaches will see the simplified view.
  // Will be dynamic once auth is wired. For now hardcoded.
  const userRole: string = "ADMIN";
  const isCoach = userRole === "COACH";

  const [schedulesFC, schedulesXT, membersFC, membersXT] = await Promise.all([
    getTodaySchedules(Sede.FITNESS_CENTER),
    getTodaySchedules(Sede.XTREME),
    getActiveMembers(Sede.FITNESS_CENTER),
    getActiveMembers(Sede.XTREME),
  ]);

  return (
    <div className="p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Asistencia</h1>
        <p className="text-sm text-muted-foreground">
          {isCoach
            ? "Confirma el conteo de alumnos al final de cada clase."
            : "Selecciona un horario, registra alumnos, y el coach confirma al final."}
        </p>
      </header>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-medium mb-3">
            La Cueva Fitness Center
          </h2>
          <ScheduleList
            schedules={schedulesFC}
            members={membersFC}
            sede="FITNESS_CENTER"
            userRole={userRole}
          />
        </section>

        <section>
          <h2 className="text-lg font-medium mb-3">
            La Cueva Xtreme
          </h2>
          <ScheduleList
            schedules={schedulesXT}
            members={membersXT}
            sede="XTREME"
            userRole={userRole}
          />
        </section>
      </div>
    </div>
  );
}
