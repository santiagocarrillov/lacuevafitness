-- AlterTable
ALTER TABLE "Lead"
  ADD COLUMN "adSourceId" TEXT,
  ADD COLUMN "adSourceType" TEXT,
  ADD COLUMN "adSourceUrl" TEXT,
  ADD COLUMN "adHeadline" TEXT,
  ADD COLUMN "ctwaClid" TEXT,
  ADD COLUMN "adReferredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "referral" JSONB;

-- CreateIndex
CREATE INDEX "Lead_adSourceId_idx" ON "Lead"("adSourceId");
