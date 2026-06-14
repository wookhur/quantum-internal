-- Academic Support activities per student
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.service_academic_support (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES public.service_students(id) ON DELETE CASCADE,
  academy_name TEXT,
  subject      TEXT,
  season       TEXT,   -- '방학' | '학기중'
  period_start DATE,
  period_end   DATE,
  notes        TEXT,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER service_academic_support_updated_at
  BEFORE UPDATE ON public.service_academic_support
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_academic_support ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acad_select" ON public.service_academic_support FOR SELECT TO authenticated USING (true);
CREATE POLICY "acad_insert" ON public.service_academic_support FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "acad_update" ON public.service_academic_support FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "acad_delete" ON public.service_academic_support FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
