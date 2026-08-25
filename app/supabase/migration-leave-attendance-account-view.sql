-- ============================================================
-- 재무담당자(role='account')가 전 직원 연차·근태를 열람하도록 (급여 처리용)
-- ------------------------------------------------------------
-- 원인: role='account'가 rls-account-fix에서 여러 업무테이블은 열렸지만
--       leave_requests / attendances 는 빠져 있어 전 직원 연차·근태가 0건으로 안 보임.
-- 조치: HR 열람자(admin/c_level/account)에게 두 테이블 전체 SELECT 를 '추가' 정책으로 허용.
--       기존 정책은 그대로 두고 OR로 결합되므로 안전(다른 직원의 privacy 정책 유지).
--       ※ 열람만 개방. 연차 '승인'은 approver, 근태 '편집'은 can_edit_attendance 로 별도 제어.
-- Safe to re-run.
-- ============================================================

-- 전 직원 HR 데이터 열람 가능자 판별 (RLS 서브쿼리 대체 함수)
CREATE OR REPLACE FUNCTION public.is_hr_viewer()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = ANY (ARRAY['admin','c_level','account'])
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_hr_viewer() TO authenticated;

-- 연차: HR 열람자는 전 직원 연차(모든 상태) 열람 — 기존 정책에 '추가'(OR 결합)
DROP POLICY IF EXISTS "leave_requests_select_hr_viewer" ON public.leave_requests;
CREATE POLICY "leave_requests_select_hr_viewer" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (public.is_hr_viewer());

-- 근태: HR 열람자는 전 직원 근태 열람 — 기존 정책에 '추가'(OR 결합)
DROP POLICY IF EXISTS "attendances_select_hr_viewer" ON public.attendances;
CREATE POLICY "attendances_select_hr_viewer" ON public.attendances
  FOR SELECT TO authenticated
  USING (public.is_hr_viewer());

NOTIFY pgrst, 'reload schema';

-- 확인(참고): 적용 후 재무담당자 계정으로 연차관리 현황판/근태관리에 전 직원이 뜨는지 확인.
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('leave_requests','attendances') AND cmd='SELECT'
--  ORDER BY tablename, policyname;
