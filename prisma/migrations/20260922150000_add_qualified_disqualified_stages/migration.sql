-- Dos etapas nuevas del embudo (decisión de Santiago, 22 sep 2026).
--
-- "Calificado" faltaba entre contactado y agendado: hoy no hay dónde decir
-- "esta persona sí encaja" antes de que agende.
--
-- "No califica" NO es lo mismo que "Perdido". Perdido = le fallamos a la venta.
-- No califica = nunca iba a encajar (a Kevin no le dan los horarios). Mezclarlos
-- esconde un dato de campaña: si un tercio de los leads de anuncios no califica
-- por horario, eso se arregla en Meta, no en el discurso del bot.
--
-- Idempotente: ADD VALUE IF NOT EXISTS.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'QUALIFIED';
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'DISQUALIFIED';
