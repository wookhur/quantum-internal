-- ============================================================
-- 포상휴가(reward leave) 제도
-- ------------------------------------------------------------
-- 연차 담당(승인자)이 직원에게 포상휴가 '일수'를 부여한다.
-- 직원은 leave_type='reward' 로 신청해 사용하며, 잔여 = 지급합계 - 사용합계.
-- (leave_type 컬럼은 TEXT 라 enum 변경 불필요 — 'reward' 값 그대로 사용)
-- Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reward_leave_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  days        numeric NOT NULL CHECK (days > 0),
  reason      text,
  granted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at  date NOT NULL DEFAULT CURRENT_DATE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reward_grants_profile ON public.reward_leave_grants(profile_id);

ALTER TABLE public.reward_leave_grants ENABLE ROW LEVEL SECURITY;

-- 열람: 본인 지급내역 + 승인자(연차 담당)는 전 직원
DROP POLICY IF EXISTS reward_grants_select ON public.reward_leave_grants;
CREATE POLICY reward_grants_select ON public.reward_leave_grants
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_leave_approver());

-- 지급(부여)·삭제: 승인자(연차 담당)만
DROP POLICY IF EXISTS reward_grants_insert ON public.reward_leave_grants;
CREATE POLICY reward_grants_insert ON public.reward_leave_grants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_leave_approver());
DROP POLICY IF EXISTS reward_grants_delete ON public.reward_leave_grants;
CREATE POLICY reward_grants_delete ON public.reward_leave_grants
  FOR DELETE TO authenticated
  USING (public.is_leave_approver());

NOTIFY pgrst, 'reload schema';
