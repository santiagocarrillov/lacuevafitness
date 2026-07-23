-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('STAFF', 'MEMBER');

-- AlterTable
ALTER TABLE "TestResult"
  ADD COLUMN "source" "EntrySource" NOT NULL DEFAULT 'STAFF',
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedByUserId" TEXT;

-- AlterTable
ALTER TABLE "BodyComposition"
  ADD COLUMN "source" "EntrySource" NOT NULL DEFAULT 'STAFF',
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedByUserId" TEXT;
