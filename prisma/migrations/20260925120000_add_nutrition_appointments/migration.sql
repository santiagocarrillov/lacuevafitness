-- Agenda de la nutricionista: reemplaza las "reuniones" de HubSpot.
-- Aditiva: dos enums nuevos y una tabla nueva. No toca datos existentes.

DO $$ BEGIN
  CREATE TYPE "AppointmentKind" AS ENUM ('INITIAL', 'FOLLOW_UP', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "NutritionAppointment" (
  "id" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "staffUserId" TEXT NOT NULL,
  "sede" "Sede" NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "durationMin" INTEGER NOT NULL DEFAULT 30,
  "kind" "AppointmentKind" NOT NULL DEFAULT 'FOLLOW_UP',
  "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "notes" TEXT,
  "reminderSentAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NutritionAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NutritionAppointment_startsAt_idx" ON "NutritionAppointment"("startsAt");
CREATE INDEX IF NOT EXISTS "NutritionAppointment_memberId_startsAt_idx" ON "NutritionAppointment"("memberId", "startsAt");

ALTER TABLE "NutritionAppointment" DROP CONSTRAINT IF EXISTS "NutritionAppointment_memberId_fkey";
ALTER TABLE "NutritionAppointment"
  ADD CONSTRAINT "NutritionAppointment_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NutritionAppointment" DROP CONSTRAINT IF EXISTS "NutritionAppointment_staffUserId_fkey";
ALTER TABLE "NutritionAppointment"
  ADD CONSTRAINT "NutritionAppointment_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
