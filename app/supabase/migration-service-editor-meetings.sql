-- Essay-editor meeting notes per student (simple memo; no report upload).
-- Kept separate from consultant meetings (service_meetings). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.service_editor_meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES public.service_students(id) ON DELETE CASCADE,
  meeting_date  DATE,
  editor        TEXT,
  content       TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_editor_meetings_student
  ON public.service_editor_meetings(student_id);

DROP TRIGGER IF EXISTS service_editor_meetings_updated_at ON public.service_editor_meetings;
CREATE TRIGGER service_editor_meetings_updated_at
  BEFORE UPDATE ON public.service_editor_meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_editor_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "editor_meetings_select" ON public.service_editor_meetings;
DROP POLICY IF EXISTS "editor_meetings_insert" ON public.service_editor_meetings;
DROP POLICY IF EXISTS "editor_meetings_update" ON public.service_editor_meetings;
DROP POLICY IF EXISTS "editor_meetings_delete" ON public.service_editor_meetings;
CREATE POLICY "editor_meetings_select" ON public.service_editor_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "editor_meetings_insert" ON public.service_editor_meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "editor_meetings_update" ON public.service_editor_meetings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "editor_meetings_delete" ON public.service_editor_meetings FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
