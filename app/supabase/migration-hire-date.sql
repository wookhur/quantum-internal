-- 입사일(hire date): used to compute annual-leave accrual. Safe to re-run.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hire_date DATE;
NOTIFY pgrst, 'reload schema';
