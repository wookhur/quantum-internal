-- 세미나 신청자 수정(1부/2부 재배정, session_labels 변경 등)이 저장되도록
-- seminar_registrations 에 authenticated UPDATE 권한을 추가한다.
-- (기존엔 SELECT/INSERT/DELETE만 있어 UPDATE가 조용히 무시되던 문제 수정)
-- Safe to re-run.

ALTER TABLE public.seminar_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seminar_registrations_update_auth" ON public.seminar_registrations;
CREATE POLICY "seminar_registrations_update_auth" ON public.seminar_registrations
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
