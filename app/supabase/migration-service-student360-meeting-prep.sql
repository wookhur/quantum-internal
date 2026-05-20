-- Student 360 — prep-materials URL on the meeting record. Safe to re-run.

ALTER TABLE service_meetings ADD COLUMN IF NOT EXISTS prep_url TEXT;

NOTIFY pgrst, 'reload schema';
