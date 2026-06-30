-- Student birthday, shown on the service dashboard calendar. Safe to re-run.

ALTER TABLE public.service_students
  ADD COLUMN IF NOT EXISTS birth_date DATE;

NOTIFY pgrst, 'reload schema';
