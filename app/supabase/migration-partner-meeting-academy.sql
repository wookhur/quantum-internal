-- 파트너 미팅 코멘트: 같은 학원(academy) 소속 강사끼리 서로의 코멘트를 볼 수 있도록
-- 작성 시점의 소속학원을 행에 저장. 기존 행은 작성자 프로필의 partner_academy로 백필.
-- 재실행 안전.
ALTER TABLE public.partner_student_meetings
  ADD COLUMN IF NOT EXISTS partner_academy text;

-- 기존 코멘트 백필: 작성자(partner_id) 프로필의 소속학원으로 채움
UPDATE public.partner_student_meetings m
SET partner_academy = p.partner_academy
FROM public.profiles p
WHERE m.partner_id = p.id
  AND m.partner_academy IS NULL
  AND p.partner_academy IS NOT NULL;

-- academy 필터 성능용 인덱스(선택)
CREATE INDEX IF NOT EXISTS idx_partner_meetings_academy
  ON public.partner_student_meetings (partner_academy);

NOTIFY pgrst, 'reload schema';
