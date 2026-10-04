"use server";

// Nutrition booking: the nutritionist's weekly hours and time off, booking
// links for socios (/cita/[código]), and self-booking from the portal and the
// link. Every function checks who is calling: staff, the session socio, or
// the holder of a valid booking code.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireMember, can, getSedeScope } from "@/lib/auth";
import type { Sede } from "@/generated/prisma/client";
import { ecuadorDateString } from "@/lib/timezone";
import { ecuadorLocalToUtc } from "@/lib/nutrition/appointments";
import { timeToMinute, type SedeKey, type SlotDay } from "@/lib/nutrition/slots";
import { bookSlot, ensureInvite, inviteUrl, loadSlots } from "@/lib/nutrition/booking-core";
import { toSchedule, type ToScheduleItem } from "@/lib/nutrition/to-schedule";

const SEDES: SedeKey[] = ["FITNESS_CENTER", "XTREME"];
const asSede = (v: string): SedeKey => {
  if (!SEDES.includes(v as SedeKey)) throw new Error("Elige la sede.");
  return v as SedeKey;
};

async function requireScheduler() {
  const user = await requireAuth();
  if (!can.scheduleNutrition(user)) throw new Error("Sin permisos");
  return user;
}

async function requireNutritionist() {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Solo la nutricionista o el dueño cambian los horarios.");
  return user;
}

function revalidateNutrition() {
  revalidatePath("/dashboard/nutricion", "layout");
  revalidatePath("/portal/nutricion");
  revalidatePath("/portal/hoy");
}

// ── Weekly hours and time off ───────────────────────────────────────────────

export async function getAvailability() {
  await requireScheduler();
  const [windows, timeOff, staff] = await Promise.all([
    prisma.nutritionAvailability.findMany({
      where: { active: true },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      include: { staff: { select: { fullName: true } } },
    }),
    prisma.nutritionTimeOff.findMany({
      where: { active: true, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      include: { staff: { select: { fullName: true } } },
    }),
    prisma.user.findMany({
      where: { active: true, role: { in: ["NUTRITIONIST", "OWNER"] } },
      orderBy: [{ role: "desc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, role: true },
    }),
  ]);
  return { windows, timeOff, staff };
}

export async function saveAvailabilityWindow(input: { staffUserId?: string; sede: string; weekdays: number[]; start: string; end: string; slotMinutes: number }) {
  const user = await requireNutritionist();
  const sede = asSede(input.sede);
  const startMinute = timeToMinute(input.start);
  const endMinute = timeToMinute(input.end);
  const slotMinutes = Math.round(input.slotMinutes);
  if (endMinute <= startMinute) throw new Error("La hora de fin debe ser después de la de inicio.");
  if (slotMinutes < 15 || slotMinutes > 120) throw new Error("Cada cita debe durar entre 15 y 120 minutos.");
  if (endMinute - startMinute < slotMinutes) throw new Error("El bloque es más corto que una cita.");
  const weekdays = [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7);
  if (!weekdays.length) throw new Error("Elige al menos un día.");
  const staffUserId = input.staffUserId || (user.role === "NUTRITIONIST" ? user.id : (await prisma.user.findFirst({ where: { active: true, role: "NUTRITIONIST" }, select: { id: true } }))?.id ?? user.id);

  const existing = await prisma.nutritionAvailability.findMany({ where: { staffUserId, active: true, weekday: { in: weekdays } } });
  const clash = existing.find((w) => w.startMinute < endMinute && startMinute < w.endMinute);
  if (clash) throw new Error("Ese horario se cruza con otro bloque del mismo día: bórralo o ajústalo primero.");
  await prisma.nutritionAvailability.createMany({
    data: weekdays.map((weekday) => ({ staffUserId, sede, weekday, startMinute, endMinute, slotMinutes })),
  });
  revalidateNutrition();
}

export async function removeAvailabilityWindow(id: string) {
  await requireNutritionist();
  await prisma.nutritionAvailability.update({ where: { id }, data: { active: false } });
  revalidateNutrition();
}

export async function addTimeOff(input: { staffUserId?: string; from: string; to: string; startTime?: string; endTime?: string; reason?: string }) {
  const user = await requireNutritionist();
  const startsAt = ecuadorLocalToUtc(input.from, input.startTime || "00:00");
  const endsAt = input.endTime ? ecuadorLocalToUtc(input.to, input.endTime) : new Date(ecuadorLocalToUtc(input.to, "00:00").getTime() + 86_400_000);
  if (endsAt <= startsAt) throw new Error("El fin debe ser después del inicio.");
  const staffUserId = input.staffUserId || (user.role === "NUTRITIONIST" ? user.id : (await prisma.user.findFirst({ where: { active: true, role: "NUTRITIONIST" }, select: { id: true } }))?.id ?? user.id);
  const clashes = await prisma.nutritionAppointment.count({ where: { staffUserId, status: "SCHEDULED", startsAt: { gte: startsAt, lt: endsAt } } });
  await prisma.nutritionTimeOff.create({ data: { staffUserId, startsAt, endsAt, reason: input.reason?.trim() || null } });
  revalidateNutrition();
  return { clashes };
}

export async function removeTimeOff(id: string) {
  await requireNutritionist();
  await prisma.nutritionTimeOff.update({ where: { id }, data: { active: false } });
  revalidateNutrition();
}

/** Open slots, as staff see them (for the panel and the booking screen). */
export async function getOpenSlots(fromDate?: string, days = 14, sede?: SedeKey | null): Promise<SlotDay[]> {
  await requireScheduler();
  return loadSlots(prisma, { fromDate, days, sede });
}

/** Staff books a socio straight into an open slot (from the panel). */
export async function staffBookSlot(memberId: string, startsAt: string, sede: string, staffUserId: string) {
  const user = await requireScheduler();
  const scope = getSedeScope(user);
  if (scope && sede !== scope) throw new Error("Solo puedes agendar en tu sede.");
  const r = await bookSlot({ memberId, startsAt, sede: asSede(sede), staffUserId, source: "STAFF", createdById: user.id });
  revalidateNutrition();
  return { id: r.appointmentId };
}

// ── "Por agendar" and booking links ─────────────────────────────────────────

export async function getToSchedule(): Promise<ToScheduleItem[]> {
  const user = await requireScheduler();
  return toSchedule({ sede: getSedeScope(user) });
}

/** A booking link for one socio, plus a WhatsApp chat already written. */
export async function createBookingLink(memberId: string, reason: "TRIAL" | "MEASUREMENT" | "MANUAL", deadline?: string | null) {
  const user = await requireScheduler();
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { firstName: true, phone: true, sede: true } });
  if (!member) throw new Error("Socio no encontrado.");
  const scope = getSedeScope(user);
  if (scope && member.sede !== scope) throw new Error("Ese socio es de otra sede.");
  const inv = await ensureInvite({ memberId, reason, deadline: deadline ?? null, kind: reason === "TRIAL" ? "INITIAL" : "FOLLOW_UP", createdById: user.id });
  const url = inviteUrl(inv.code);
  const until = inv.deadline ? ` antes del ${new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(inv.deadline)}` : "";
  const text =
    reason === "TRIAL"
      ? `¡Hola ${member.firstName}! Tus dos semanas de evaluación en La Cueva incluyen una cita con la nutricionista. Elige tu horario${until} aquí: ${url}`
      : `¡Hola ${member.firstName}! 🥗 Es hora de tu cita con la nutricionista para medirte y revisar tu alimentación. Elige el día y la hora aquí: ${url}`;
  const digits = (member.phone ?? "").replace(/\D/g, "");
  const phone = digits.startsWith("0") ? `593${digits.slice(1)}` : digits;
  revalidatePath("/dashboard/nutricion");
  return { url, text, whatsappUrl: phone.length >= 11 ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null };
}

// ── Portal: the socio books for themself ────────────────────────────────────

export async function getMyBookingOptions() {
  const { member } = await requireMember();
  const [slots, next] = await Promise.all([
    loadSlots(prisma, { days: 14 }),
    prisma.nutritionAppointment.findFirst({
      where: { memberId: member.id, status: "SCHEDULED", startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, sede: true },
    }),
  ]);
  return { slots, next, homeSede: member.sede as SedeKey };
}

export async function bookMySlot(startsAt: string, sede: string, staffUserId: string) {
  const { member } = await requireMember();
  const r = await bookSlot({ memberId: member.id, startsAt, sede: asSede(sede), staffUserId, source: "MEMBER" });
  revalidateNutrition();
  return { startsAt: r.startsAt.toISOString(), sede: r.sede, moved: r.moved };
}

// ── Public link: whoever holds the code books that socio's consult ──────────

export async function bookWithInvite(code: string, startsAt: string, sede: string, staffUserId: string) {
  if (!/^[a-z0-9]{6,16}$/.test(code)) throw new Error("Enlace inválido.");
  const inv = await prisma.nutritionBookingInvite.findUnique({ where: { code } });
  if (!inv || inv.expiresAt.getTime() < Date.now()) throw new Error("Este enlace ya venció. Escríbenos por WhatsApp y te mandamos otro.");
  if (inv.appointmentId) {
    const appt = await prisma.nutritionAppointment.findUnique({ where: { id: inv.appointmentId }, select: { status: true, startsAt: true } });
    // Moving a booked consult is fine; using the link again after it happened is not.
    if (!appt || appt.status !== "SCHEDULED" || appt.startsAt.getTime() < Date.now()) throw new Error("Este enlace ya se usó. Escríbenos por WhatsApp para otra cita.");
  }
  const r = await bookSlot({ memberId: inv.memberId, startsAt, sede: asSede(sede), staffUserId, kind: inv.kind, source: "INVITE", inviteId: inv.id });
  revalidateNutrition();
  return { startsAt: r.startsAt.toISOString(), sede: r.sede, moved: r.moved, day: ecuadorDateString(r.startsAt) };
}
