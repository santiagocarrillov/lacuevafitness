-- CreateEnum
CREATE TYPE "AdherenceLevel" AS ENUM ('GREEN', 'YELLOW', 'ORANGE', 'RED');

-- AlterTable
ALTER TABLE "MealLog" ADD COLUMN "adherence" "AdherenceLevel";

-- CreateTable
CREATE TABLE "NutritionFocus" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionFocus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionTip" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sede" "Sede",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "authoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionTip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionFocus_memberId_key" ON "NutritionFocus"("memberId");

-- CreateIndex
CREATE INDEX "NutritionTip_active_createdAt_idx" ON "NutritionTip"("active", "createdAt");

-- AddForeignKey
ALTER TABLE "NutritionFocus" ADD CONSTRAINT "NutritionFocus_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
