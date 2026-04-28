-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_memberId_fkey";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankEntity" TEXT,
ADD COLUMN     "bankReference" TEXT,
ADD COLUMN     "depositorName" TEXT,
ADD COLUMN     "isPoolEntry" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "memberId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_isPoolEntry_status_idx" ON "Payment"("isPoolEntry", "status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
