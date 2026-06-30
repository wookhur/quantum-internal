-- Partner-logged student meetings (content + date). Partners log these from
-- the Partner › 학생 관리 page. Keyed by partner + student name (from contracts).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.partner_student_meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_name  TEXT NOT NULL,
  school_name   TEXT,
  meeting_date  DATE,
  program       TEXT,
  content       TEXT,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_student_meetings_partner
  ON public.partner_student_meetings(partner_id);

DROP TRIGGER IF EXISTS partner_student_meetings_updated_at ON public.partner_student_meetings;
CREATE TRIGGER partner_student_meetings_updated_at
  BEFORE UPDATE ON public.partner_student_meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_student_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_meetings_select" ON public.partner_student_meetings;
DROP POLICY IF EXISTS "partner_meetings_insert" ON public.partner_student_meetings;
DROP POLICY IF EXISTS "partner_meetings_update" ON public.partner_student_meetings;
DROP POLICY IF EXISTS "partner_meetings_delete" ON public.partner_student_meetings;
CREATE POLICY "partner_meetings_select" ON public.partner_student_meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "partner_meetings_insert" ON public.partner_student_meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "partner_meetings_update" ON public.partner_student_meetings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "partner_meetings_delete" ON public.partner_student_meetings FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
