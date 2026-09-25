/**
 * Prueba de la lógica pura de la agenda de nutrición
 * (src/lib/nutrition/appointments.ts): horas Ecuador → UTC, qué citas reciben
 * el recordatorio del día anterior y cómo se clasifica la cobertura.
 * No toca la BD ni manda pushes.
 *
 * Uso:  npm run test:nutricion-agenda
 */

import {
  addDays,
  coverageState,
  daysSince,
  ecuadorDayRange,
  ecuadorLocalToUtc,
  ecuadorTimeString,
  mondayOf,
  selectAppointmentsToRemind,
  type AppointmentStatus,
} from "../src/lib/nutrition/appointments";
import { isStaffFreeTraining } from "../src/lib/staff-free-training";

let fallos = 0;
function check(nombre: string, ok: boolean) {
  if (!ok) fallos++;
  console.log(`${ok ? "✅" : "❌"} ${nombre}`);
}

// ── Zona horaria ───────────────────────────────────────────────────────────
const t = ecuadorLocalToUtc("2026-10-02", "10:30");
check("10:30 Ecuador = 15:30 UTC", t.toISOString() === "2026-10-02T15:30:00.000Z");
check("ida y vuelta de la hora", ecuadorTimeString(t) === "10:30");
const late = ecuadorLocalToUtc("2026-10-02", "20:00");
check("20:00 Ecuador cae al día siguiente en UTC", late.toISOString() === "2026-10-03T01:00:00.000Z");
const r = ecuadorDayRange("2026-10-02", "2026-10-02");
check("el día Ecuador empieza a las 05:00 UTC", r.start.toISOString() === "2026-10-02T05:00:00.000Z");
check("…y dura 24 h", r.end.getTime() - r.start.getTime() === 24 * 3600 * 1000);
check("una cita a las 20:00 entra en su día", late >= r.start && late < r.end);

check("addDays cruza de mes", addDays("2026-09-30", 1) === "2026-10-01");
check("lunes de un jueves", mondayOf("2026-10-01") === "2026-09-28");
check("lunes de un domingo es el anterior", mondayOf("2026-10-04") === "2026-09-28");
check("lunes de un lunes es él mismo", mondayOf("2026-09-28") === "2026-09-28");

// ── Recordatorio del día anterior ──────────────────────────────────────────
// Cron a las 23:00 UTC del 1 oct = 18:00 Ecuador del 1 oct → recuerda las del 2 oct.
const now = new Date("2026-10-01T23:00:00Z");
const mk = (id: string, date: string, time: string, status: AppointmentStatus = "SCHEDULED", sent: Date | null = null) => ({
  id,
  startsAt: ecuadorLocalToUtc(date, time),
  status,
  reminderSentAt: sent,
});
const appts = [
  mk("manana-temprano", "2026-10-02", "07:00"),
  mk("manana-noche", "2026-10-02", "20:30"), // 01:30 UTC del 3 oct, sigue siendo "mañana" en Ecuador
  mk("hoy", "2026-10-01", "19:00"),
  mk("pasado", "2026-10-03", "09:00"),
  mk("cancelada", "2026-10-02", "10:00", "CANCELLED"),
  mk("ya-avisada", "2026-10-02", "11:00", "SCHEDULED", new Date()),
];
const due = selectAppointmentsToRemind(appts, now).map((a) => a.id).sort();
check(
  "recuerda solo las de mañana (Ecuador), agendadas y sin aviso",
  JSON.stringify(due) === JSON.stringify(["manana-noche", "manana-temprano"]),
);

// ── Cobertura ──────────────────────────────────────────────────────────────
const hoy = new Date("2026-10-01T15:00:00Z");
const hace = (d: number) => new Date(hoy.getTime() - d * 24 * 3600 * 1000);
check("sin citas → nunca atendido", coverageState(null, null, hoy) === "never");
check("con cita próxima gana aunque nunca fue", coverageState(null, hace(-3), hoy) === "scheduled");
check("atendido hace 30 días → al día", coverageState(hace(30), null, hoy) === "ok");
check("atendido hace 70 días → toca control", coverageState(hace(70), null, hoy) === "overdue");
check("daysSince cuenta días calendario de Ecuador", daysSince(hace(30), hoy) === 30);

// ── Staff que entrena gratis ───────────────────────────────────────────────
check("Luis Bahamonde es staff", isStaffFreeTraining("Luis", "Bahamonde"));
check("María José González con tildes", isStaffFreeTraining("María José", "González Pérez"));
check("Cristian Carrillo", isStaffFreeTraining("Cristian", "Carrillo"));
check("un socio cualquiera no", !isStaffFreeTraining("Luis", "Pérez"));
check("José Fernández ≠ José Correa", !isStaffFreeTraining("José", "Correa"));

console.log(fallos === 0 ? "\nTodo OK" : `\n${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
