-- contract_status enum was ('active','expiring_soon','expired') only, so setting
-- a contract to '서비스 중도해지'(terminated) or '계약 취소'(cancelled) silently failed
-- (enum rejected the value) → 취소/이탈 count stayed 0. Add the missing values.
-- Safe to re-run.

ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'terminated';

NOTIFY pgrst, 'reload schema';
