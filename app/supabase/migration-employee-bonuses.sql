-- ============================================================
-- 상여금(보너스) 지급 — 재무대시보드
-- ------------------------------------------------------------
-- 인센티브와 별개로 간헐적으로 지급하는 상여금.
-- 재무권한자가 직원·금액 입력 → account가 급여에 합산 후 '지급완료' 체크.
-- 열람·편집 모두 재무(account/admin/c_level)만. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_bonuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      numeric NOT NULL DEFAULT 0,
  month       text,                          -- 'YYYY-MM' 지급(반영) 월
  reason      text,                          -- 상여 사유
  paid        boolean NOT NULL DEFAULT false,-- 급여 반영(지급) 완료 여부
  paid_at     date,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_bonuses_month ON public.employee_bonuses(month);

ALTER TABLE public.employee_bonuses ENABLE ROW LEVEL SECURITY;

-- 열람·편집 모두 재무·관리자만 (민감정보)
DROP POLICY IF EXISTS employee_bonuses_all ON public.employee_bonuses;
CREATE POLICY employee_bonuses_all ON public.employee_bonuses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = ANY (ARRAY['admin','c_level','account']) OR is_account = true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = ANY (ARRAY['admin','c_level','account']) OR is_account = true)));

NOTIFY pgrst, 'reload schema';
