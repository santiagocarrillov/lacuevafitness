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

  // ── Membership Plans ──────────────────────────────────────────────
  const plans = [
    { name: "Trial 2 semanas", priceCents: 900, billingCycle: BillingCycle.TRIAL, durationDays: 14 },
    { name: "Mensual", priceCents: 7500, billingCycle: BillingCycle.MONTHLY, durationDays: 30 },
    { name: "Trimestral", priceCents: 19500, billingCycle: BillingCycle.QUARTERLY, durationDays: 90 },
    { name: "Semestral", priceCents: 36000, billingCycle: BillingCycle.SEMIANNUAL, durationDays: 180 },
    { name: "Anual", priceCents: 60000, billingCycle: BillingCycle.ANNUAL, durationDays: 365 },
  ];
  for (const plan of plans) {
    await prisma.membershipPlan.upsert({
      where: { id: `plan-${plan.billingCycle}` },
      update: {},
      create: {
        id: `plan-${plan.billingCycle}`,
        name: plan.name,
        priceCents: plan.priceCents,
        billingCycle: plan.billingCycle,
        durationDays: plan.durationDays,
        currency: "USD",
      },
    });
  }
  console.log("  Membership plans: 5");

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
