-- Add regular_meeting_schedule column to service_students
-- Run once in the Supabase SQL editor.

ALTER TABLE service_students
  ADD COLUMN IF NOT EXISTS regular_meeting_schedule TEXT;

NOTIFY pgrst, 'reload schema';
