-- 반차(0.5일) 신청: 오전/오후 구분 저장.
--   half_day_period: 'morning'(오전 반차) | 'afternoon'(오후 반차) | NULL(종일 휴가)
-- days = 0.5 인 신청에만 값이 들어간다. Safe to re-run.

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS half_day_period TEXT;

NOTIFY pgrst, 'reload schema';
