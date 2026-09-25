-- Nutrición 2.0 · PR 2: base de alimentos propia, recetas y metas nutricionales.
-- Aditiva: 4 enums y 4 tablas nuevas. No toca datos existentes.

-- CreateEnum
CREATE TYPE "FoodSource" AS ENUM ('CURATED', 'OPEN_FOOD_FACTS', 'STAFF', 'MEMBER');

-- CreateEnum
CREATE TYPE "ExchangeGroup" AS ENUM ('PROTEIN', 'STARCH', 'FRUIT', 'VEGETABLE', 'DAIRY', 'FAT', 'SUGAR', 'FREE');

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('PRIVATE', 'SUBMITTED', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TargetSource" AS ENUM ('CALCULATED', 'MEMBER', 'NUTRITIONIST');

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "searchName" TEXT NOT NULL,
    "barcode" TEXT,
    "kcal" DOUBLE PRECISION NOT NULL,
    "proteinG" DOUBLE PRECISION NOT NULL,
    "carbsG" DOUBLE PRECISION NOT NULL,
    "fatG" DOUBLE PRECISION NOT NULL,
    "fiberG" DOUBLE PRECISION,
    "sugarG" DOUBLE PRECISION,
    "satFatG" DOUBLE PRECISION,
    "sodiumMg" DOUBLE PRECISION,
    "isLiquid" BOOLEAN NOT NULL DEFAULT false,
    "portions" JSONB,
    "exchangeGroup" "ExchangeGroup",
    "exchangeGrams" DOUBLE PRECISION,
    "source" "FoodSource" NOT NULL,
    "sourceNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "createdByMemberId" TEXT,
    "createdByUserId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "prepMinutes" INTEGER,
    "photoUrl" TEXT,
    "tags" TEXT[],
    "mealKeys" TEXT[],
    "status" "RecipeStatus" NOT NULL DEFAULT 'PRIVATE',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "authorUserId" TEXT,
    "authorMemberId" TEXT,
    "sourceUrl" TEXT,
    "macrosFromIngredients" BOOLEAN NOT NULL DEFAULT true,
    "kcal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiberG" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "foodId" TEXT,
    "label" TEXT NOT NULL,
    "grams" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionTarget" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL,
    "carbsG" INTEGER NOT NULL,
    "fatG" INTEGER NOT NULL,
    "mealSplit" JSONB NOT NULL,
    "inputs" JSONB,
    "source" "TargetSource" NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Food_barcode_key" ON "Food"("barcode");

-- CreateIndex
CREATE INDEX "Food_searchName_idx" ON "Food"("searchName");

-- CreateIndex
CREATE INDEX "Food_verifiedAt_active_idx" ON "Food"("verifiedAt", "active");

-- CreateIndex
CREATE INDEX "Food_createdByMemberId_idx" ON "Food"("createdByMemberId");

-- CreateIndex
CREATE INDEX "Recipe_status_active_idx" ON "Recipe"("status", "active");

-- CreateIndex
CREATE INDEX "Recipe_authorMemberId_idx" ON "Recipe"("authorMemberId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionTarget_memberId_key" ON "NutritionTarget"("memberId");

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_createdByMemberId_fkey" FOREIGN KEY ("createdByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_authorMemberId_fkey" FOREIGN KEY ("authorMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionTarget" ADD CONSTRAINT "NutritionTarget_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

