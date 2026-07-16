-- Definitive fix: convert contracts.status from the restrictive contract_status
-- ENUM (which only had active/expiring_soon/expired) to plain TEXT, so
-- 'cancelled'(계약 취소) and 'terminated'(서비스 중도해지) can be stored.
-- (The enum ADD VALUE approach can fail depending on transaction handling.)
-- Existing values are preserved. Safe to re-run.

ALTER TABLE public.contracts ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.contracts ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.contracts ALTER COLUMN status SET DEFAULT 'active';

NOTIFY pgrst, 'reload schema';
