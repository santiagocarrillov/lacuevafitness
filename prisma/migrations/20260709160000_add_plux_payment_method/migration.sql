-- Add TC Plux as a distinct credit-card payment method (separate from Stripe).
-- Idempotent so it is safe whether applied manually or via `prisma migrate deploy`.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'PLUX_CARD';
