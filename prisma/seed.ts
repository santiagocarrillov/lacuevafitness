import { PrismaClient, Sede, DayOfWeek, UserRole, BillingCycle } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding La Cueva...");

  // ── Users (staff) ─────────────────────────────────────────────────
  const santiago = await prisma.user.upsert({
    where: { email: "santiago@lacueva.com" },
    update: {},
    create: { email: "santiago@lacueva.com", fullName: "Santiago Carrillo", role: UserRole.OWNER, sede: null },
  });
  const isabel = await prisma.user.upsert({
    where: { email: "isabel@lacueva.com" },
    update: {},
    create: { email: "isabel@lacueva.com", fullName: "Isabel", role: UserRole.ACCOUNTING, sede: null },
  });
  const adminFC = await prisma.user.upsert({
    where: { email: "admin.fc@lacueva.com" },
    update: {},
    create: { email: "admin.fc@lacueva.com", fullName: "Admin Fitness Center", role: UserRole.ADMIN, sede: Sede.FITNESS_CENTER },
  });
  const adminXT = await prisma.user.upsert({
    where: { email: "admin.xt@lacueva.com" },
    update: {},
    create: { email: "admin.xt@lacueva.com", fullName: "Admin Xtreme", role: UserRole.ADMIN, sede: Sede.XTREME },
  });
  const coachFC = await prisma.user.upsert({
    where: { email: "coach.fc@lacueva.com" },
    update: {},
    create: { email: "coach.fc@lacueva.com", fullName: "Coach Fitness Center", role: UserRole.COACH, sede: Sede.FITNESS_CENTER },
  });
  const coachXT = await prisma.user.upsert({
    where: { email: "coach.xt@lacueva.com" },
    update: {},
    create: { email: "coach.xt@lacueva.com", fullName: "Coach Xtreme", role: UserRole.COACH, sede: Sede.XTREME },
  });
  console.log("  Users:", [santiago, isabel, adminFC, adminXT, coachFC, coachXT].map(u => u.fullName).join(", "));

  // ── Class Schedules ───────────────────────────────────────────────
  // Delete old schedules first to replace with correct times
  await prisma.classSchedule.deleteMany({});

  const weekdays: DayOfWeek[] = ["MON", "TUE", "WED", "THU", "FRI"];

  // La Cueva Fitness Center — L-V
  const fcWeekdayTimes = ["05:30", "06:30", "07:30", "08:30", "16:30", "17:30", "18:30", "19:30"];
  // La Cueva Xtreme — L-V
  const xtWeekdayTimes = ["06:00", "07:00", "08:00", "09:00", "17:00", "18:00", "19:00", "20:00"];

  for (const day of weekdays) {
    for (const time of fcWeekdayTimes) {
      await prisma.classSchedule.create({
        data: {
          id: `fc-${day}-${time}`,
          sede: Sede.FITNESS_CENTER,
          dayOfWeek: day,
          startTime: time,
          name: `WOD ${time}`,
          capacity: 20,
          durationMin: 60,
        },
      });
    }
    for (const time of xtWeekdayTimes) {
      await prisma.classSchedule.create({
        data: {
          id: `xt-${day}-${time}`,
          sede: Sede.XTREME,
          dayOfWeek: day,
          startTime: time,
          name: `Funcional ${time}`,
          capacity: 20,
          durationMin: 60,
        },
      });
    }
  }

  // Saturdays — La Cueva Fitness: 6:30, 7:30
  for (const time of ["06:30", "07:30"]) {
    await prisma.classSchedule.create({
      data: {
        id: `fc-SAT-${time}`,
        sede: Sede.FITNESS_CENTER,
        dayOfWeek: DayOfWeek.SAT,
        startTime: time,
        name: `WOD ${time}`,
        capacity: 20,
        durationMin: 60,
      },
    });
  }

  // Saturdays — La Cueva Xtreme: 7:00, 8:00
  for (const time of ["07:00", "08:00"]) {
    await prisma.classSchedule.create({
      data: {
        id: `xt-SAT-${time}`,
        sede: Sede.XTREME,
        dayOfWeek: DayOfWeek.SAT,
        startTime: time,
        name: `Funcional ${time}`,
        capacity: 20,
        durationMin: 60,
      },
    });
  }

  const totalSchedules = await prisma.classSchedule.count();
  console.log(`  Class schedules: ${totalSchedules} total`);

  // ── Membership Plans (precios reales La Cueva 2026) ────────────────
  const plans = [
    { id: "plan-TRIAL", name: "Trial 2 semanas ($9)", priceCents: 900, billingCycle: BillingCycle.TRIAL, durationDays: 14, description: "2 semanas de prueba" },
    { id: "plan-ONE_TIME", name: "Pase diario ($4)", priceCents: 400, billingCycle: BillingCycle.ONE_TIME, durationDays: 1, description: "Clase individual" },
    { id: "plan-MONTHLY", name: "Mensual ($60)", priceCents: 6000, billingCycle: BillingCycle.MONTHLY, durationDays: 30, description: "Membresía mensual estándar" },
    { id: "plan-MONTHLY-DESC", name: "Mensual con descuento ($50)", priceCents: 5000, billingCycle: BillingCycle.MONTHLY, durationDays: 30, description: "Mensual con descuento especial" },
    { id: "plan-QUARTERLY", name: "Trimestral ($150 transferencia)", priceCents: 15000, billingCycle: BillingCycle.QUARTERLY, durationDays: 90, description: "Trimestral — 15% descuento si es transferencia" },
    { id: "plan-QUARTERLY-TC", name: "Trimestral TC ($50/mes x3)", priceCents: 15000, billingCycle: BillingCycle.QUARTERLY, durationDays: 90, description: "Trimestral cobrado $50/mes con tarjeta de crédito" },
    { id: "plan-ANNUAL", name: "Anual ($40/mes x12 TC)", priceCents: 48000, billingCycle: BillingCycle.ANNUAL, durationDays: 365, description: "Contrato anual — $40/mes descontados con tarjeta" },
  ];
  for (const plan of plans) {
    await prisma.membershipPlan.upsert({
      where: { id: plan.id },
      update: { name: plan.name, priceCents: plan.priceCents, description: plan.description },
      create: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        billingCycle: plan.billingCycle,
        durationDays: plan.durationDays,
        currency: "USD",
      },
    });
  }
  console.log(`  Membership plans: ${plans.length}`);

  // No sample members — members will come from CRM import.
  console.log("  Members: none (will import from CRM)");

  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
