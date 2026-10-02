
-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('OPENING', 'MANUAL', 'PAYMENT', 'INVOICE', 'OTHER_INCOME', 'EXPENSE', 'CAPITAL', 'BANK', 'DEFERRED_REVENUE', 'DEPRECIATION', 'ACCRUAL', 'PAYROLL', 'CLOSING');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('POSTED', 'VOIDED');

-- AlterTable
ALTER TABLE "LedgerAccount" ADD COLUMN     "expenseCategory" "ExpenseCategory",
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "postable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "number" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL,
    "sourceId" TEXT,
    "status" "JournalStatus" NOT NULL DEFAULT 'POSTED',
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "party" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_sede_date_idx" ON "JournalEntry"("sede", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_source_sourceId_idx" ON "JournalEntry"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_sede_number_key" ON "JournalEntry"("sede", "number");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_party_idx" ON "JournalLine"("party");

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity: each line is exactly one side, positive (not expressible in Prisma).
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_one_side_chk"
  CHECK (("debitCents" > 0 AND "creditCents" = 0) OR ("debitCents" = 0 AND "creditCents" > 0));
