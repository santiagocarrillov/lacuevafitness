-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "portalInviteCode" TEXT,
ADD COLUMN     "portalInviteCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Member_portalInviteCode_key" ON "Member"("portalInviteCode");
