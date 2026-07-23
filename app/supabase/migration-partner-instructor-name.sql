-- 파트너 강사관리: 강사 이름 필드 추가 + 코멘트 작성자 이름 표시.
-- 재실행 안전.

-- 1) 강사 레지스트리에 이름 컬럼
ALTER TABLE public.partner_instructors
  ADD COLUMN IF NOT EXISTS name text;

-- 2) 미팅 코멘트에 작성자 이름(표시용) 컬럼
ALTER TABLE public.partner_student_meetings
  ADD COLUMN IF NOT EXISTS author_name text;

-- 3) 기존 코멘트 작성자 이름 백필:
--    작성자(partner_id) 프로필의 이메일로 강사 레지스트리 이름을 우선 매칭, 없으면 프로필 이름.
UPDATE public.partner_student_meetings m
SET author_name = COALESCE(pi.name, pr.name)
FROM public.profiles pr
LEFT JOIN public.partner_instructors pi ON lower(pi.email) = lower(pr.email)
WHERE m.partner_id = pr.id
  AND m.author_name IS NULL
  AND COALESCE(pi.name, pr.name) IS NOT NULL;

NOTIFY pgrst, 'reload schema';
