-- Service program billing + incentive fields.
-- EC activities and academic support entries (from Student 360) become the
-- source of the External Service Fees page. Admins fill billed amount /
-- collection status / per-contributor % there; the contributor names come
-- from Student 360. Safe to re-run.

ALTER TABLE service_ec_activities
  ADD COLUMN IF NOT EXISTS billed_amount BIGINT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'KRW',
  ADD COLUMN IF NOT EXISTS collection_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (collection_status IN ('pending', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_date DATE,
  ADD COLUMN IF NOT EXISTS contributor_1_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS contributor_2_percentage NUMERIC;

ALTER TABLE service_academic_support
  ADD COLUMN IF NOT EXISTS billed_amount BIGINT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'KRW',
  ADD COLUMN IF NOT EXISTS collection_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (collection_status IN ('pending', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_date DATE,
  ADD COLUMN IF NOT EXISTS contributor_1_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS contributor_2_percentage NUMERIC;

NOTIFY pgrst, 'reload schema';
