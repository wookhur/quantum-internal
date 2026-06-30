-- Mark a profile as a partner company account (designated in 직원 관리).
-- Designated partners populate the Student 360 partner dropdown. Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_partner BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
