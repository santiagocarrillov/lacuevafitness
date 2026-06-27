-- AlterTable
ALTER TABLE "MemberNote" ADD COLUMN     "visibleToMember" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClinicalRecord" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalRecord_memberId_createdAt_idx" ON "ClinicalRecord"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_authoredById_fkey" FOREIGN KEY ("authoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: preserve what members can currently see. Today the portal surfaces
-- nutritionist-authored notes; mark those visible so the privacy-by-default flip
-- does not silently hide notes socios already rely on.
UPDATE "MemberNote" SET "visibleToMember" = true
WHERE "authorId" IN (SELECT "id" FROM "User" WHERE "role" = 'NUTRITIONIST');
