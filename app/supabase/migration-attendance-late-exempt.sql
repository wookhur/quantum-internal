-- Attendance: allow an attendance-manager to waive the auto "지각(late)" flag
-- (e.g. holiday afternoon shifts detected as late) while keeping the worked hours.
-- Safe to re-run.
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS late_exempt boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
