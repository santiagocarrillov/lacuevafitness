-- AlterEnum
ALTER TYPE "BankTxnKind" ADD VALUE IF NOT EXISTS 'PAYROLL';
ALTER TYPE "BankTxnKind" ADD VALUE IF NOT EXISTS 'TAXES';

-- AlterTable
ALTER TABLE "PayrollLine" ADD COLUMN "bankTransactionId" TEXT;

-- CreateIndex
CREATE INDEX "PayrollLine_bankTransactionId_idx" ON "PayrollLine"("bankTransactionId");

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
