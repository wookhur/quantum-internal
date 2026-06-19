-- Student 360 — generalize the follow-up checklist to multiple diary fields.
-- Adds a `category` column so the same table can hold both follow-up
-- commitments ('followup') and assignments ('assignment').
-- Existing rows default to 'followup'. Safe to re-run.

ALTER TABLE service_followups
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'followup';

CREATE INDEX IF NOT EXISTS idx_service_followups_category ON service_followups(category);

NOTIFY pgrst, 'reload schema';
