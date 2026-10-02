-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL,
    "acquiredOn" DATE NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 120,
    "residualCents" INTEGER NOT NULL DEFAULT 0,
    "openingAccumulatedCents" INTEGER NOT NULL DEFAULT 0,
    "startsOn" DATE NOT NULL,
    "expenseLineId" TEXT,
    "disposedOn" DATE,
    "disposalNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_expenseLineId_key" ON "FixedAsset"("expenseLineId");

-- CreateIndex
CREATE INDEX "FixedAsset_sede_idx" ON "FixedAsset"("sede");

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_expenseLineId_fkey" FOREIGN KEY ("expenseLineId") REFERENCES "ExpenseLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

