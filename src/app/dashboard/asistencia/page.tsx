import { Sede } from "@/generated/prisma/client";
import { getTodaySchedules, getActiveMembers } from "@/lib/actions/attendance";
import { ScheduleList } from "./schedule-list";

export default async function AsistenciaPage() {
  // TODO: derive sede from logged-in user's role/sede.
  // For now, show both sedes with tabs.
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
        <p className="text-sm text-zinc-400">
          Selecciona un horario, registra alumnos, y el coach confirma al final.
        </p>
      </header>

      <div className="space-y-8">
        <section>
          <h2 className="text-lg font-medium mb-3 text-zinc-300">
            La Cueva Fitness Center
          </h2>
          <ScheduleList
            schedules={schedulesFC}
            members={membersFC}
            sede={Sede.FITNESS_CENTER}
          />
        </section>

        <section>
          <h2 className="text-lg font-medium mb-3 text-zinc-300">
            La Cueva Xtreme
          </h2>
          <ScheduleList
            schedules={schedulesXT}
            members={membersXT}
            sede={Sede.XTREME}
          />
        </section>
      </div>
    </div>
  );
}
