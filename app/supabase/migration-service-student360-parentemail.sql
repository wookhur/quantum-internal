-- Student 360 — parent email. Run after the earlier student360 migrations. Safe to re-run.

ALTER TABLE service_students ADD COLUMN IF NOT EXISTS parent_email TEXT;

NOTIFY pgrst, 'reload schema';
