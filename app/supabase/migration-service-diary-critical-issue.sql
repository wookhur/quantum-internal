-- Add a Critical Issue (risks / issues / escalations) field to the meeting
-- diary, shown after Critical Dates. Feeds the weekly QC report. Safe to re-run.

ALTER TABLE service_diary
  ADD COLUMN IF NOT EXISTS critical_issue TEXT;

NOTIFY pgrst, 'reload schema';
