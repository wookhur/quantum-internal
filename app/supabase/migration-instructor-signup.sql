-- 외부 파트너 강사 셀프 가입 게이트: 익명 사용자가 "등록된 강사 이메일인지"만
-- 확인할 수 있는 SECURITY DEFINER 함수 (테이블 자체는 노출하지 않음). Safe to re-run.

CREATE OR REPLACE FUNCTION public.instructor_email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partner_instructors WHERE lower(email) = lower(p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.instructor_email_exists(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
