-- AlterTable
-- Outbound send tracking for Message. Values of "sendStatus": 'SENT' | 'FAILED' | 'DRAFT'.
-- NULL means unknown (every INBOUND row, plus OUTBOUND rows that predate this column) —
-- no backfill is performed on purpose, and the UI renders NULL as "desconocido".
ALTER TABLE "Message"
  ADD COLUMN "sendStatus" TEXT,
  ADD COLUMN "sendError" TEXT,
  ADD COLUMN "sendAttemptedAt" TIMESTAMP(3);
