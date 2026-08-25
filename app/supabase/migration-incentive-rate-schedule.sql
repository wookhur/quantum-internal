-- ============================================================
-- 인센티브 요율 이력 (effective-dated) — "요율 + 적용 시작월"
-- ------------------------------------------------------------
-- (대상자, 인센티브유형)별로 '언제부터 몇 %' 를 기록.
-- 인센티브 계산 시 각 회차의 수금월(미수는 예정일월)에 유효한 요율을 자동 적용.
--   · 스케줄이 있는 (사람,유형)만 적용 → 없으면 기존 계약별 %(그대로).
--   · 특정 월보다 이른 회차는 스케줄 이전이므로 기존 %로 폴백(과거 보존).
-- 예: 김지현 service_team 2% 2026-08 → 7월 이하 1%(기존), 8월부터 2% 자동.
--     판신디 service_team 0% 2026-08 → 8월부터 미반영(과거는 그대로).
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.incentive_rate_schedule (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  incentive_type text NOT NULL,                        -- 'service_team' 등 INCENTIVE_TYPES 키
  rate           numeric NOT NULL CHECK (rate >= 0 AND rate <= 100),
  effective_from text NOT NULL,                        -- 'YYYY-MM' 적용 시작월
  note           text,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, incentive_type, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_incentive_rate_sched ON public.incentive_rate_schedule (profile_id, incentive_type);

ALTER TABLE public.incentive_rate_schedule ENABLE ROW LEVEL SECURITY;

-- 열람: 인센티브 계산에 필요하므로 인증 사용자 허용
DROP POLICY IF EXISTS incentive_rate_sched_select ON public.incentive_rate_schedule;
CREATE POLICY incentive_rate_sched_select ON public.incentive_rate_schedule
  FOR SELECT TO authenticated USING (true);

-- 설정(추가/수정/삭제): 재무·관리자만
DROP POLICY IF EXISTS incentive_rate_sched_write ON public.incentive_rate_schedule;
CREATE POLICY incentive_rate_sched_write ON public.incentive_rate_schedule
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ANY (ARRAY['admin','c_level','account'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ANY (ARRAY['admin','c_level','account'])));

NOTIFY pgrst, 'reload schema';
