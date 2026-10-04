-- CreateTable
CREATE TABLE "MemberNotice" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "messageId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberNoticeSetting" (
    "kind" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberNoticeSetting_pkey" PRIMARY KEY ("kind")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberNotice_key_key" ON "MemberNotice"("key");

-- CreateIndex
CREATE INDEX "MemberNotice_memberId_createdAt_idx" ON "MemberNotice"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberNotice_kind_createdAt_idx" ON "MemberNotice"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberNotice" ADD CONSTRAINT "MemberNotice_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

