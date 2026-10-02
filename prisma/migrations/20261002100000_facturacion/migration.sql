-- CreateEnum
CREATE TYPE "TaxIdType" AS ENUM ('CEDULA', 'RUC', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "SaleItemKind" AS ENUM ('SERVICE', 'GOOD');

-- CreateEnum
CREATE TYPE "SriEnvironment" AS ENUM ('PRUEBAS', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'AUTHORIZED', 'REJECTED', 'VOIDED');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "taxId" TEXT,
ADD COLUMN     "taxIdType" "TaxIdType";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "invoiceId" TEXT;

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "sede" "Sede",
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "ivaRate" INTEGER NOT NULL DEFAULT 15,
    "kind" "SaleItemKind" NOT NULL DEFAULT 'SERVICE',
    "incomeAccountCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionPoint" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "establishment" TEXT NOT NULL,
    "point" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lastSequential" INTEGER NOT NULL DEFAULT 0,
    "environment" "SriEnvironment" NOT NULL DEFAULT 'PRUEBAS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmissionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "sede" "Sede" NOT NULL,
    "emissionPointId" TEXT NOT NULL,
    "sequential" INTEGER NOT NULL,
    "accessKey" TEXT NOT NULL,
    "environment" "SriEnvironment" NOT NULL,
    "issueDate" DATE NOT NULL,
    "memberId" TEXT,
    "buyerIdType" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerAddress" TEXT,
    "buyerPhone" TEXT,
    "subtotalCents" INTEGER NOT NULL,
    "ivaCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "sriPayForm" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "sriMessages" JSONB,
    "sentAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "authorizationNumber" TEXT,
    "xmlPath" TEXT,
    "emailedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "ivaRate" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "ivaCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "incomeAccountCode" TEXT NOT NULL,
    "membershipId" TEXT,
    "saleItemId" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmissionPoint_sede_establishment_point_environment_key" ON "EmissionPoint"("sede", "establishment", "point", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_accessKey_key" ON "Invoice"("accessKey");

-- CreateIndex
CREATE INDEX "Invoice_sede_issueDate_idx" ON "Invoice"("sede", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_memberId_idx" ON "Invoice"("memberId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_emissionPointId_sequential_key" ON "Invoice"("emissionPointId", "sequential");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_membershipId_idx" ON "InvoiceLine"("membershipId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_emissionPointId_fkey" FOREIGN KEY ("emissionPointId") REFERENCES "EmissionPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

