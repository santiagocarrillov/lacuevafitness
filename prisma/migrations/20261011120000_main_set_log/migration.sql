-- CreateTable
CREATE TABLE "MainSetLog" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "weekNumber" INTEGER,
    "pattern" TEXT,
    "exercise" TEXT NOT NULL,
    "loadKg" DOUBLE PRECISION NOT NULL,
    "reps" INTEGER NOT NULL,
    "rir" INTEGER NOT NULL,
    "notes" TEXT,
    "source" "EntrySource" NOT NULL DEFAULT 'MEMBER',
    "recordedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MainSetLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MainSetLog_memberId_date_key" ON "MainSetLog"("memberId", "date");

-- CreateIndex
CREATE INDEX "MainSetLog_memberId_exercise_date_idx" ON "MainSetLog"("memberId", "exercise", "date");

-- AddForeignKey
ALTER TABLE "MainSetLog" ADD CONSTRAINT "MainSetLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
