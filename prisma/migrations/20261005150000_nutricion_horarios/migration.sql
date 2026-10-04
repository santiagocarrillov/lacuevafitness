-- CreateTable
CREATE TABLE "NutritionAvailability" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionTimeOff" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionBookingInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" "AppointmentKind" NOT NULL DEFAULT 'FOLLOW_UP',
    "reason" TEXT NOT NULL,
    "deadline" DATE,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appointmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionBookingInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionAvailability_staffUserId_active_idx" ON "NutritionAvailability"("staffUserId", "active");

-- CreateIndex
CREATE INDEX "NutritionTimeOff_staffUserId_startsAt_idx" ON "NutritionTimeOff"("staffUserId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionBookingInvite_code_key" ON "NutritionBookingInvite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionBookingInvite_appointmentId_key" ON "NutritionBookingInvite"("appointmentId");

-- CreateIndex
CREATE INDEX "NutritionBookingInvite_memberId_idx" ON "NutritionBookingInvite"("memberId");

-- AddForeignKey
ALTER TABLE "NutritionAvailability" ADD CONSTRAINT "NutritionAvailability_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionTimeOff" ADD CONSTRAINT "NutritionTimeOff_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionBookingInvite" ADD CONSTRAINT "NutritionBookingInvite_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

