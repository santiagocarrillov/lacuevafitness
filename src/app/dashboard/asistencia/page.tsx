import { Sede } from "@/generated/prisma/client";
import { getTodaySchedules, getActiveMembers } from "@/lib/actions/attendance";
import { requireAuth, getSedeScope } from "@/lib/auth";
import { ScheduleList } from "./schedule-list";

export const dynamic = "force-dynamic";

export default async function AsistenciaPage() {
  const user = await requireAuth();
  const scopedSede = getSedeScope(user);
  const isCoach = user.role === "COACH";

  // Which sedes to show: if user is scoped, only their sede; otherwise both.
  const showFC = !scopedSede || scopedSede === "FITNESS_CENTER";
  const showXT = !scopedSede || scopedSede === "XTREME";

  const [schedulesFC, schedulesXT, membersFC, membersXT] = await Promise.all([
    showFC ? getTodaySchedules(Sede.FITNESS_CENTER) : Promise.resolve([]),
    showXT ? getTodaySchedules(Sede.XTREME) : Promise.resolve([]),
    showFC ? getActiveMembers(Sede.FITNESS_CENTER) : Promise.resolve([]),
    showXT ? getActiveMembers(Sede.XTREME) : Promise.resolve([]),
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
        {showFC && (
          <section>
            <h2 className="text-lg font-medium mb-3">La Cueva Fitness Center</h2>
            <ScheduleList
              schedules={schedulesFC}
              members={membersFC}
              sede="FITNESS_CENTER"
              userRole={user.role}
            />
          </section>
        )}

        {showXT && (
          <section>
            <h2 className="text-lg font-medium mb-3">La Cueva Xtreme</h2>
            <ScheduleList
              schedules={schedulesXT}
              members={membersXT}
              sede="XTREME"
              userRole={user.role}
            />
          </section>
        )}
      </div>
    </div>
  );
}
