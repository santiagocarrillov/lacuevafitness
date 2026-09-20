-- Scheduled hand-back to the bot ("devolver al bot el lunes 8am").
-- Additive + nullable: NULL keeps today's behaviour (paused until a human acts).
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "botResumeAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Conversation_botResumeAt_idx" ON "Conversation" ("botResumeAt");
