
-- CreateEnum
CREATE TYPE "ExpenseDocType" AS ENUM ('FACTURA', 'NOTA_VENTA', 'LIQUIDACION_COMPRA', 'RECIBO', 'SIN_DOCUMENTO');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PAID', 'PENDING');

-- CreateEnum
CREATE TYPE "ExpensePayMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'BANK_DEBIT', 'DEBIT_CARD', 'CREDIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "CapitalKind" AS ENUM ('CONTRIBUTION', 'SHAREHOLDER_LOAN', 'LOAN_REPAYMENT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "OtherIncomeCategory" AS ENUM ('PRODUCT_SALE', 'REIMBURSEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "BankAccountKind" AS ENUM ('BUSINESS', 'PERSONAL_MIXED');

-- CreateEnum
CREATE TYPE "BankStatementFormat" AS ENUM ('GUAYAQUIL', 'PERSONAL', 'PRODUBANCO');

-- CreateEnum
CREATE TYPE "BankTxnStatus" AS ENUM ('PENDING', 'CLASSIFIED', 'IGNORED');

-- CreateEnum
CREATE TYPE "BankTxnKind" AS ENUM ('MEMBER_PAYMENT', 'OTHER_INCOME', 'EXPENSE', 'CAPITAL', 'CARD_SETTLEMENT', 'INTERNAL_TRANSFER', 'PERSONAL', 'LOAN_PAYMENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'BANK_FEES';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'INTEREST';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankTransactionId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "bankTransactionId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "documentType" "ExpenseDocType" NOT NULL DEFAULT 'SIN_DOCUMENTO',
ADD COLUMN     "dueDate" DATE,
ADD COLUMN     "ivaCents" INTEGER,
ADD COLUMN     "paidAt" DATE,
ADD COLUMN     "paymentMethod" "ExpensePayMethod",
ADD COLUMN     "receiptPath" TEXT,
ADD COLUMN     "sriAccessKey" TEXT,
ADD COLUMN     "status" "ExpenseStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "subtotalCents" INTEGER,
ADD COLUMN     "supplierName" TEXT,
ADD COLUMN     "supplierRuc" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ALTER COLUMN "sede" SET NOT NULL;

-- CreateTable
CREATE TABLE "CapitalMovement" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "person" TEXT NOT NULL,
    "kind" "CapitalKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "bankTransactionId" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapitalMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherIncome" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "category" "OtherIncomeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "bankTransactionId" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtherIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "last4" TEXT,
    "kind" "BankAccountKind" NOT NULL DEFAULT 'BUSINESS',
    "statementFormat" "BankStatementFormat" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "counterparty" TEXT,
    "reference" TEXT,
    "balanceCents" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "status" "BankTxnStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "BankTxnKind",
    "importBatch" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "direction" INTEGER NOT NULL DEFAULT 0,
    "kind" "BankTxnKind" NOT NULL,
    "category" "ExpenseCategory",
    "sede" "Sede",
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CapitalMovement_sede_date_idx" ON "CapitalMovement"("sede", "date");

-- CreateIndex
CREATE INDEX "CapitalMovement_person_idx" ON "CapitalMovement"("person");

-- CreateIndex
CREATE INDEX "OtherIncome_sede_date_idx" ON "OtherIncome"("sede", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_fingerprint_key" ON "BankTransaction"("fingerprint");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_postedAt_idx" ON "BankTransaction"("accountId", "postedAt");

-- CreateIndex
CREATE INDEX "BankTransaction_status_idx" ON "BankTransaction"("status");

-- CreateIndex
CREATE INDEX "Payment_bankTransactionId_idx" ON "Payment"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_sriAccessKey_key" ON "Expense"("sriAccessKey");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_bankTransactionId_idx" ON "Expense"("bankTransactionId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalMovement" ADD CONSTRAINT "CapitalMovement_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
