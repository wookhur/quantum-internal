-- Student 360 — extra fields (run AFTER migration-service-student360.sql)
-- Adds the full master-sheet columns to service_students and the
-- per-column meeting-diary fields to service_diary. Safe to re-run.

-- ── service_students: master-sheet columns ──
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS korean_name TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS essay_editor TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS partners TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS majors TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS accepted_uni TEXT;
ALTER TABLE service_students ADD COLUMN IF NOT EXISTS address TEXT;

-- status becomes free text (sheet uses Active / Processing / New client / Onboarding / Contract finished ...)
ALTER TABLE service_students DROP CONSTRAINT IF EXISTS service_students_status_check;

-- ── service_diary: per-column meeting-diary fields ──
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS agenda_items TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS meeting_summary TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS extracurricular_notes TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS identity_narrative_notes TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS questions_concerns TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS next_meeting_agenda TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS follow_up_commitments TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS assignments TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS critical_dates TEXT;
