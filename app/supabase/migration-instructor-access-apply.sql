-- 외부 파트너 강사 접근권한이 로그인 계정에 실제로 적용되도록:
--  (1) 사용자가 자기 자신의 feature_access 행은 읽을 수 있게 RLS 추가
--      (기존엔 admin/manager만 읽을 수 있어 external 강사는 항상 기본권한으로 떨어짐)
--  (2) 로그인 시 partner_instructors의 enabled_routes를 본인 계정에 적용하는 보안 함수
-- Safe to re-run.

-- (1) read-own-row policy (OR'd with existing admin/manager select policy)
DROP POLICY IF EXISTS "feature_access_select_own" ON public.feature_access;
CREATE POLICY "feature_access_select_own" ON public.feature_access
  FOR SELECT USING (user_id = auth.uid());

-- (2) apply the current user's own instructor access (SECURITY DEFINER bypasses write RLS)
CREATE OR REPLACE FUNCTION public.apply_my_instructor_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   text;
  v_routes  text[];
  v_academy text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN; END IF;

  SELECT enabled_routes, academy INTO v_routes, v_academy
    FROM public.partner_instructors
    WHERE lower(email) = lower(v_email)
    LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.profiles
    SET is_partner = true, partner_academy = v_academy, updated_at = now()
    WHERE id = auth.uid();

  -- 강사 라우트는 feature_access 행이 아직 없을 때만 최초 provision 한다.
  -- 기존 행이 있으면(= 관리자가 인사관리에서 저장한 커스텀 권한이 있으면) 절대 덮어쓰지 않는다.
  -- 이전엔 DO UPDATE 로 매 로그인마다 덮어써서, 관리자가 저장한 권한이
  -- 로그인할 때마다 강사 기본값으로 리셋되는 버그가 있었다(예: 남연서).
  -- 강사 라우트 '변경'은 파트너강사 편집 시 applyToProfileIfExists 가 즉시 반영하므로
  -- 로그인 시 재동기화가 필요 없다.
  INSERT INTO public.feature_access (user_id, enabled_modules, enabled_routes, updated_at)
    VALUES (auth.uid(), '{}', COALESCE(v_routes, '{}'), now())
    ON CONFLICT (user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_my_instructor_access() TO authenticated;

NOTIFY pgrst, 'reload schema';
