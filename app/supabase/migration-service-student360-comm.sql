-- Student 360 — communication platform + chat link
-- Run AFTER the earlier student360 migrations. Safe to re-run.

ALTER TABLE service_students ADD COLUMN IF NOT EXISTS communication_platform TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS chat_link TEXT;
