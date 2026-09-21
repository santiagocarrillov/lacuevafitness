-- Recordatorio de evaluación 1 hora antes (sustituye al de 2h por decisión de
-- Santiago, 21 sep 2026). Idempotente: ADD VALUE IF NOT EXISTS.
ALTER TYPE "FollowupKind" ADD VALUE IF NOT EXISTS 'TRIAL_REMINDER_1H';
