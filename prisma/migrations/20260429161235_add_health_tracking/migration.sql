-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MenopausalStatus" AS ENUM ('PRE', 'PERI', 'POST');

-- AlterTable
ALTER TABLE "BodyComposition" ADD COLUMN     "recordedById" TEXT,
ADD COLUMN     "waistCm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "sex" "Sex";

-- CreateTable
CREATE TABLE "ClinicalMarker" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "glucoseFasting" DOUBLE PRECISION,
    "triglycerides" DOUBLE PRECISION,
    "hdlCholesterol" DOUBLE PRECISION,
    "hsCRP" DOUBLE PRECISION,
    "testosteroneFree" DOUBLE PRECISION,
    "estradiolE2" DOUBLE PRECISION,
    "cycleDay" INTEGER,
    "menopausalStatus" "MenopausalStatus",
    "notes" TEXT,
    "recordedById" TEXT,

    CONSTRAINT "ClinicalMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalMarker_memberId_measuredAt_idx" ON "ClinicalMarker"("memberId", "measuredAt");

-- AddForeignKey
ALTER TABLE "BodyComposition" ADD CONSTRAINT "BodyComposition_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalMarker" ADD CONSTRAINT "ClinicalMarker_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalMarker" ADD CONSTRAINT "ClinicalMarker_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
