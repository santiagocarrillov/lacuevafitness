-- Nutrición 2.0 · PR 4: checks por comida del plan y conversación socio ↔ nutricionista.
-- Aditiva. MealLogEntry estaba vacía (sin uso hasta hoy), así que el índice único es seguro.

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('MEMBER', 'STAFF');

-- AlterTable
ALTER TABLE "MealLogEntry" ADD COLUMN     "optionId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "NutritionMessage" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "mealPlanId" TEXT,
    "mealKey" TEXT,
    "date" DATE,
    "author" "MessageAuthor" NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NutritionMessage_memberId_createdAt_idx" ON "NutritionMessage"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "NutritionMessage_author_readAt_idx" ON "NutritionMessage"("author", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "MealLogEntry_mealLogId_mealKey_key" ON "MealLogEntry"("mealLogId", "mealKey");

-- AddForeignKey
ALTER TABLE "NutritionMessage" ADD CONSTRAINT "NutritionMessage_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

