-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('PAYROLL', 'RENT', 'UTILITIES', 'EQUIPMENT', 'MARKETING', 'SUPPLIES', 'SOFTWARE', 'TAXES', 'PROFESSIONAL', 'OTHER');

-- CreateTable
CREATE TABLE "MonthlyTarget" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenueTargetCents" INTEGER NOT NULL DEFAULT 0,
    "salesTarget" INTEGER NOT NULL DEFAULT 0,
    "visitorsTarget" INTEGER NOT NULL DEFAULT 0,
    "leadsTarget" INTEGER NOT NULL DEFAULT 0,
    "attendanceTarget" INTEGER NOT NULL DEFAULT 0,
    "workingDays" INTEGER NOT NULL DEFAULT 21,
    "projectedICVPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "sede" "Sede",
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyTarget_sede_year_month_key" ON "MonthlyTarget"("sede", "year", "month");

-- CreateIndex
CREATE INDEX "Expense_sede_date_idx" ON "Expense"("sede", "date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
