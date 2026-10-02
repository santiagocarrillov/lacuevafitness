-- AlterEnum
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'COACH_FEES';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "ExpenseLine" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "ivaRate" INTEGER NOT NULL DEFAULT 15,
    "ivaCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseLine_expenseId_idx" ON "ExpenseLine"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseLine_accountId_idx" ON "ExpenseLine"("accountId");

-- CreateIndex
CREATE INDEX "Expense_sede_isPrivate_idx" ON "Expense"("sede", "isPrivate");

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Existing payroll expenses are private.
UPDATE "Expense" SET "isPrivate" = true WHERE "category" = 'PAYROLL';

-- Everything recorded before this module counts as reviewed.
UPDATE "Expense" SET "reviewedAt" = "createdAt" WHERE "reviewedAt" IS NULL;
