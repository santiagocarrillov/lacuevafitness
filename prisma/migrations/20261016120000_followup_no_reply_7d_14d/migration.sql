-- Cadencia de seguimiento a leads que no contestan: toques del día 7 y del día 14.
ALTER TYPE "FollowupKind" ADD VALUE IF NOT EXISTS 'NO_REPLY_7D';
ALTER TYPE "FollowupKind" ADD VALUE IF NOT EXISTS 'NO_REPLY_14D';
