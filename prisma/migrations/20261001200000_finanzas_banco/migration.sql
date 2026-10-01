-- Finanzas 1b: the statement formats are named after the real banks
-- (Xtreme banks only with Banco del Pacífico). No rows use these values yet.
ALTER TYPE "BankStatementFormat" RENAME VALUE 'GUAYAQUIL' TO 'PACIFICO';
ALTER TYPE "BankStatementFormat" RENAME VALUE 'PERSONAL' TO 'PICHINCHA';

-- Undo data for bank-line classification.
ALTER TABLE "BankTransaction" ADD COLUMN "appliedJson" JSONB,
ADD COLUMN "classifiedAt" TIMESTAMP(3),
ADD COLUMN "classifiedById" TEXT;
