-- CreateEnum
CREATE TYPE "MealPlanSource" AS ENUM ('MANUAL', 'AI_GENERATED', 'AI_ASSISTED');

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "calorieTarget" INTEGER,
    "externalUrl" TEXT,
    "content" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "source" "MealPlanSource" NOT NULL DEFAULT 'MANUAL',
    "templateId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "visibleToMember" BOOLEAN NOT NULL DEFAULT true,
    "authoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLog" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "mealPlanId" TEXT,
    "date" DATE NOT NULL,
    "followed" BOOLEAN NOT NULL DEFAULT false,
    "freeText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLogEntry" (
    "id" TEXT NOT NULL,
    "mealLogId" TEXT NOT NULL,
    "mealKey" TEXT NOT NULL,
    "optionLabel" TEXT,
    "ate" BOOLEAN NOT NULL DEFAULT false,
    "freeText" TEXT,
    "kcal" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calorieLevel" INTEGER NOT NULL,
    "sede" "Sede",
    "content" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MealPlan_memberId_active_idx" ON "MealPlan"("memberId", "active");

-- CreateIndex
CREATE INDEX "MealPlan_memberId_createdAt_idx" ON "MealPlan"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MealLog_memberId_date_idx" ON "MealLog"("memberId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MealLog_memberId_date_key" ON "MealLog"("memberId", "date");

-- CreateIndex
CREATE INDEX "MealLogEntry_mealLogId_idx" ON "MealLogEntry"("mealLogId");

-- CreateIndex
CREATE INDEX "MealPlanTemplate_calorieLevel_active_idx" ON "MealPlanTemplate"("calorieLevel", "active");

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MealPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_authoredById_fkey" FOREIGN KEY ("authoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLog" ADD CONSTRAINT "MealLog_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealLogEntry" ADD CONSTRAINT "MealLogEntry_mealLogId_fkey" FOREIGN KEY ("mealLogId") REFERENCES "MealLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
