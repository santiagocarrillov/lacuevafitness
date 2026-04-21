import { PrismaClient, Sede, DayOfWeek, UserRole, MemberStatus, BillingCycle, MembershipState } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding La Cueva...");

  // ── Users (staff) ─────────────────────────────────────────────────
  const santiago = await prisma.user.upsert({
    where: { email: "santiago@lacueva.com" },
    update: {},
    create: {
      email: "santiago@lacueva.com",
      fullName: "Santiago Carrillo",
      role: UserRole.OWNER,
      sede: null,
    },
  });

  const isabel = await prisma.user.upsert({
    where: { email: "isabel@lacueva.com" },
    update: {},
    create: {
      email: "isabel@lacueva.com",
      fullName: "Isabel",
      role: UserRole.ACCOUNTING,
      sede: null,
    },
  });

  const adminFC = await prisma.user.upsert({
    where: { email: "admin.fc@lacueva.com" },
    update: {},
    create: {
      email: "admin.fc@lacueva.com",
      fullName: "Admin Fitness Center",
      role: UserRole.ADMIN,
      sede: Sede.FITNESS_CENTER,
    },
  });

  const adminXT = await prisma.user.upsert({
    where: { email: "admin.xt@lacueva.com" },
    update: {},
    create: {
      email: "admin.xt@lacueva.com",
      fullName: "Admin Xtreme",
      role: UserRole.ADMIN,
      sede: Sede.XTREME,
    },
  });

  const coachFC = await prisma.user.upsert({
    where: { email: "coach.fc@lacueva.com" },
    update: {},
    create: {
      email: "coach.fc@lacueva.com",
      fullName: "Coach Fitness Center",
      role: UserRole.COACH,
      sede: Sede.FITNESS_CENTER,
    },
  });

  const coachXT = await prisma.user.upsert({
    where: { email: "coach.xt@lacueva.com" },
    update: {},
    create: {
      email: "coach.xt@lacueva.com",
      fullName: "Coach Xtreme",
      role: UserRole.COACH,
      sede: Sede.XTREME,
    },
  });

  console.log("  ✓ Users created:", [santiago, isabel, adminFC, adminXT, coachFC, coachXT].map(u => u.fullName));

  // ── Class Schedules ───────────────────────────────────────────────
  const weekdays: DayOfWeek[] = ["MON", "TUE", "WED", "THU", "FRI"];
  const fcTimes = ["06:00", "07:00", "08:00", "09:00", "17:00", "18:00", "19:00"];
  const xtTimes = ["06:00", "07:00", "17:00", "18:00", "19:00", "20:00"];

  for (const day of weekdays) {
    for (const time of fcTimes) {
      await prisma.classSchedule.upsert({
        where: { id: `fc-${day}-${time}` },
        update: {},
        create: {
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
    for (const time of xtTimes) {
      await prisma.classSchedule.upsert({
        where: { id: `xt-${day}-${time}` },
        update: {},
        create: {
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
  // Saturdays
  for (const time of ["08:00", "09:00", "10:00"]) {
    await prisma.classSchedule.upsert({
      where: { id: `fc-SAT-${time}` },
      update: {},
      create: {
        id: `fc-SAT-${time}`,
        sede: Sede.FITNESS_CENTER,
        dayOfWeek: DayOfWeek.SAT,
        startTime: time,
        name: `WOD ${time}`,
        capacity: 20,
        durationMin: 60,
      },
    });
    await prisma.classSchedule.upsert({
      where: { id: `xt-SAT-${time}` },
      update: {},
      create: {
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

  console.log("  ✓ Class schedules created");

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
  console.log("  ✓ Membership plans created");

  // ── Sample Members (10 per sede) ─────────────────────────────────
  const firstNames = ["Carlos", "María", "Andrés", "Sofía", "Diego", "Valentina", "Sebastián", "Camila", "Mateo", "Isabella"];
  const lastNames = ["López", "García", "Martínez", "Rodríguez", "Hernández", "Torres", "Ramírez", "Flores", "Gómez", "Díaz"];

  const now = new Date();
  for (const sede of [Sede.FITNESS_CENTER, Sede.XTREME]) {
    const prefix = sede === Sede.FITNESS_CENTER ? "fc" : "xt";
    for (let i = 0; i < 10; i++) {
      const memberId = `${prefix}-member-${i}`;
      const member = await prisma.member.upsert({
        where: { id: memberId },
        update: {},
        create: {
          id: memberId,
          firstName: firstNames[i],
          lastName: lastNames[i],
          email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}.${prefix}@example.com`,
          phone: `+5939${String(i).padStart(8, "0")}`,
          sede,
          status: i < 8 ? MemberStatus.ACTIVE : MemberStatus.TRIAL,
          joinedAt: new Date(now.getFullYear(), now.getMonth() - 3 + i, 1),
        },
      });

      // Active membership for most, expired for 2
      const startsAt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endsAt = new Date(now.getFullYear(), now.getMonth() + (i < 7 ? 1 : 0), 0);
      await prisma.membership.upsert({
        where: { id: `${memberId}-membership` },
        update: {},
        create: {
          id: `${memberId}-membership`,
          memberId: member.id,
          planId: "plan-MONTHLY",
          state: i < 7 ? MembershipState.ACTIVE : (i < 8 ? MembershipState.EXPIRED : MembershipState.ACTIVE),
          startsAt,
          endsAt,
        },
      });
    }
  }
  console.log("  ✓ Sample members + memberships created (20 total)");

  console.log("🌱 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
