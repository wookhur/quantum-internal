-- 파트너 강사 소속학원명 (파트너 강사관리). Safe to re-run.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partner_academy text;

NOTIFY pgrst, 'reload schema';
