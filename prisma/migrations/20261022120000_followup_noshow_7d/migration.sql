-- Tercer toque al no-show (día 7) — ver src/lib/leads/trial-attendance.ts
ALTER TYPE "FollowupKind" ADD VALUE IF NOT EXISTS 'NOSHOW_RECOVERY_7D';
