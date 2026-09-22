-- Una conversación pertenece a un NÚMERO, no a un lead.
--
-- Hasta hoy `Conversation.leadId` era obligatorio, así que solo se podía hablar
-- con leads. Los 1441 socios quedaban sin canal (1437 de ellos ni siquiera
-- tienen lead vinculado), y la plantilla `miembro_inasistencia` llevaba
-- aprobada desde el 21 sep sin poder usarse. El comentario en templates.ts lo
-- decía literal: "Conversation solo se ata a Lead, no a Member".
--
-- Crear 1437 leads falsos para darles canal habría ensuciado el embudo entero.
-- La conversación pasa a colgar de uno de los dos, nunca de ninguno ni de ambos.

ALTER TABLE "Conversation" ALTER COLUMN "leadId" DROP NOT NULL;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "memberId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_memberId_key" ON "Conversation"("memberId");

ALTER TABLE "Conversation"
  DROP CONSTRAINT IF EXISTS "Conversation_memberId_fkey";
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactamente un dueño. Sin esto, una conversación huérfana no tendría a quién
-- mostrar en el inbox y una con dos dueños tendría dos nombres.
ALTER TABLE "Conversation"
  DROP CONSTRAINT IF EXISTS "Conversation_one_owner";
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_one_owner"
  CHECK (("leadId" IS NOT NULL) <> ("memberId" IS NOT NULL));
