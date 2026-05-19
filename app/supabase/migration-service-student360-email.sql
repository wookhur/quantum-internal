-- Student 360 — student email. Run after the earlier student360 migrations. Safe to re-run.

ALTER TABLE service_students ADD COLUMN IF NOT EXISTS email TEXT;

NOTIFY pgrst, 'reload schema';
