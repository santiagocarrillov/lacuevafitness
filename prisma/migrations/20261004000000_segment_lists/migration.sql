-- Listas manuales de personas (segmentos armados por el staff). Solo tablas nuevas:
-- aditivo, no toca nada existente.

CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sede" "Sede",
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SegmentEntry" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "leadId" TEXT,
    "memberId" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SegmentEntry_pkey" PRIMARY KEY ("id"),
    -- Exactamente uno de los dos: la entrada es de un lead O de un socio.
    CONSTRAINT "SegmentEntry_one_owner" CHECK (("leadId" IS NULL) <> ("memberId" IS NULL))
);

CREATE INDEX "Segment_archivedAt_idx" ON "Segment"("archivedAt");
CREATE UNIQUE INDEX "SegmentEntry_segmentId_leadId_key" ON "SegmentEntry"("segmentId", "leadId");
CREATE UNIQUE INDEX "SegmentEntry_segmentId_memberId_key" ON "SegmentEntry"("segmentId", "memberId");
CREATE INDEX "SegmentEntry_leadId_idx" ON "SegmentEntry"("leadId");
CREATE INDEX "SegmentEntry_memberId_idx" ON "SegmentEntry"("memberId");

ALTER TABLE "Segment" ADD CONSTRAINT "Segment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SegmentEntry" ADD CONSTRAINT "SegmentEntry_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SegmentEntry" ADD CONSTRAINT "SegmentEntry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SegmentEntry" ADD CONSTRAINT "SegmentEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SegmentEntry" ADD CONSTRAINT "SegmentEntry_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
