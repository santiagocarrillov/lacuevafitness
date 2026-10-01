
-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "LedgerRole" AS ENUM ('CASH_ON_HAND', 'BANK', 'INVENTORY', 'PREPAID', 'FIXED_ASSET', 'ACCUMULATED_DEPRECIATION', 'TAX_CREDIT', 'PAYABLES', 'INTEREST_PAYABLE', 'PAYROLL_LIABILITIES', 'SHAREHOLDER_LOANS', 'RELATED_LOANS', 'CAPITAL', 'RETAINED_EARNINGS', 'OTHER');

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "role" "LedgerRole" NOT NULL DEFAULT 'OTHER',
    "bankAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "asOf" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "person" TEXT,
    "source" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_sede_code_key" ON "LedgerAccount"("sede", "code");

-- CreateIndex
CREATE INDEX "OpeningBalance_accountId_asOf_idx" ON "OpeningBalance"("accountId", "asOf");

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalance" ADD CONSTRAINT "OpeningBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
