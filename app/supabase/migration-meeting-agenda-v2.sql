-- ============================================================
-- 회의안건 게시판 확장: 결정사항·참석응답·파일첨부
-- (migration-meeting-agenda.sql 적용 이후 실행). Safe to re-run.
-- ============================================================

-- 3) 회의록/결정사항 (액션아이템 정리 칸)
ALTER TABLE public.meeting_agendas ADD COLUMN IF NOT EXISTS decisions text;

-- 4) 참석 여부 응답: { "<profile_id>": "yes" | "no" | "maybe" }
ALTER TABLE public.meeting_agendas ADD COLUMN IF NOT EXISTS attendee_responses jsonb NOT NULL DEFAULT '{}';

-- 6) 파일 첨부
CREATE TABLE IF NOT EXISTS public.meeting_agenda_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   uuid NOT NULL REFERENCES public.meeting_agendas(id) ON DELETE CASCADE,
  name         text NOT NULL,
  url          text NOT NULL,
  path         text,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_files_meeting ON public.meeting_agenda_files(meeting_id);
ALTER TABLE public.meeting_agenda_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_files_all ON public.meeting_agenda_files;
CREATE POLICY meeting_files_all ON public.meeting_agenda_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage 버킷 (공개 읽기)
INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-files', 'meeting-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "meeting_files_read" ON storage.objects;
CREATE POLICY "meeting_files_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'meeting-files');
DROP POLICY IF EXISTS "meeting_files_write" ON storage.objects;
CREATE POLICY "meeting_files_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'meeting-files');
DROP POLICY IF EXISTS "meeting_files_delete" ON storage.objects;
CREATE POLICY "meeting_files_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'meeting-files');

NOTIFY pgrst, 'reload schema';
