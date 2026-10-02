
-- CreateTable
CREATE TABLE "PeriodClose" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "lockedThrough" DATE NOT NULL,
    "closedById" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodClose_sede_lockedThrough_idx" ON "PeriodClose"("sede", "lockedThrough");
