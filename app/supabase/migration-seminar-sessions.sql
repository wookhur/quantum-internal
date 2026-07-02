-- Add multi-session support to seminars.
-- One seminar (e.g. "2026 전공별 진학 전략 웨비나 시리즈") can now have
-- multiple date/time sessions, and applicants pick one or more.

-- Sessions live on the seminar as a small jsonb array. Shape:
--   [{ "label": "7/18 (토) Natural Science", "datetime": "2026-07-18 10:00" }, ...]
-- No separate table — the list is short and always fetched with its seminar.
ALTER TABLE seminars
  ADD COLUMN IF NOT EXISTS sessions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Each registration records which session labels the person chose.
-- Empty array means "the legacy single-date seminar" (backward compatible).
ALTER TABLE seminar_registrations
  ADD COLUMN IF NOT EXISTS session_labels text[] NOT NULL DEFAULT ARRAY[]::text[];
