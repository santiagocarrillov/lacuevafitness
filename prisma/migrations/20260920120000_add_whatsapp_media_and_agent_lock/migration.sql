-- Inbound WhatsApp media (voice notes, photos, documents): keep Meta's media id so
-- the inbox can stream the file on demand. Additive + nullable: safe to apply while
-- the previous build is live.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaMimeType" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaKind" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaVoice" BOOLEAN;

-- Single-flight guard so simultaneous webhook deliveries don't each answer.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "agentLockedAt" TIMESTAMP(3);
