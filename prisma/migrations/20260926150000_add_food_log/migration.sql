-- Nutrición 2.0 · PR 5: diario de comidas estilo MyFitnessPal.
-- Aditiva: 1 enum y 1 tabla nuevos.

-- CreateEnum
CREATE TYPE "FoodLogSource" AS ENUM ('SEARCH', 'PLAN', 'RECIPE', 'QUICK_ADD', 'COPY', 'SUGGESTION', 'BARCODE');

-- CreateTable
CREATE TABLE "FoodLogEntry" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "mealKey" TEXT NOT NULL,
    "foodId" TEXT,
    "recipeId" TEXT,
    "name" TEXT NOT NULL,
    "grams" DOUBLE PRECISION,
    "servings" DOUBLE PRECISION,
    "portionLabel" TEXT,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "fiberG" DOUBLE PRECISION,
    "source" "FoodLogSource" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodLogEntry_memberId_date_idx" ON "FoodLogEntry"("memberId", "date");

-- CreateIndex
CREATE INDEX "FoodLogEntry_memberId_createdAt_idx" ON "FoodLogEntry"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "FoodLogEntry" ADD CONSTRAINT "FoodLogEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLogEntry" ADD CONSTRAINT "FoodLogEntry_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodLogEntry" ADD CONSTRAINT "FoodLogEntry_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

