-- Nutrición 2.0 · PR 3: planes estructurados con borrador y publicación.
-- Aditiva: columnas nullable. Los planes existentes (links a Google Doc) ya
-- estaban visibles para el socio, así que se marcan como publicados.

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN     "draftContent" JSONB,
ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MealPlanTemplate" ADD COLUMN     "authoredById" TEXT;


-- Backfill
UPDATE "MealPlan" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;
