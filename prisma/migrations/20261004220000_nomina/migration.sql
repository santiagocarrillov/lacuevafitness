-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('DEPENDENCIA', 'HONORARIOS');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'VOIDED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "idNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'DEPENDENCIA',
    "monthlySalaryCents" INTEGER NOT NULL DEFAULT 0,
    "weeklyHours" INTEGER NOT NULL DEFAULT 40,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "iessAffiliated" BOOLEAN NOT NULL DEFAULT true,
    "monthlyDecimoTercero" BOOLEAN NOT NULL DEFAULT false,
    "monthlyDecimoCuarto" BOOLEAN NOT NULL DEFAULT false,
    "monthlyFondosReserva" BOOLEAN NOT NULL DEFAULT true,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "userId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" DATE,
    "paidMethod" "ExpensePayMethod",
    "notes" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "daysWorked" INTEGER NOT NULL DEFAULT 30,
    "overtime50Hours" INTEGER NOT NULL DEFAULT 0,
    "overtime100Hours" INTEGER NOT NULL DEFAULT 0,
    "bonusCents" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "incomeTaxCents" INTEGER NOT NULL DEFAULT 0,
    "baseCents" INTEGER NOT NULL DEFAULT 0,
    "overtimeCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "iessPersonalCents" INTEGER NOT NULL DEFAULT 0,
    "iessEmployerCents" INTEGER NOT NULL DEFAULT 0,
    "fondosReservaCents" INTEGER NOT NULL DEFAULT 0,
    "decimoTerceroCents" INTEGER NOT NULL DEFAULT 0,
    "decimoCuartoCents" INTEGER NOT NULL DEFAULT 0,
    "vacationCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_sede_active_idx" ON "Employee"("sede", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_sede_period_key" ON "PayrollRun"("sede", "period");

-- CreateIndex
CREATE INDEX "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_employeeId_key" ON "PayrollLine"("runId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

