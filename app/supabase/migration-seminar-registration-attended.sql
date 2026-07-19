-- 세미나 신청자별 참석 여부 기록 (CSV 가져오기 및 참석 뱃지에 사용).
--   attended: true = 참석함
-- Safe to re-run.

ALTER TABLE public.seminar_registrations
  ADD COLUMN IF NOT EXISTS attended boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
