-- CreateTable
CREATE TABLE "MenstrualPeriod" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenstrualPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenstrualPeriod_memberId_startDate_idx" ON "MenstrualPeriod"("memberId", "startDate");

-- AddForeignKey
ALTER TABLE "MenstrualPeriod" ADD CONSTRAINT "MenstrualPeriod_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
