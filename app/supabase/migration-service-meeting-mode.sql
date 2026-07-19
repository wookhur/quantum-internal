-- Student 360 미팅 기록에 진행 형식(온라인/대면) 저장 컬럼 추가.
--   meeting_mode: 'online' | 'in_person' (null = 미지정)
-- Safe to re-run.

ALTER TABLE public.service_meetings
  ADD COLUMN IF NOT EXISTS meeting_mode text;

NOTIFY pgrst, 'reload schema';
