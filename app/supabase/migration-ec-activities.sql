-- Extra Curricular Service activities per student
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.service_ec_activities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID NOT NULL REFERENCES public.service_students(id) ON DELETE CASCADE,
  partner              TEXT,
  period_start         DATE,
  period_end           DATE,
  program              TEXT,
  sales_contributor_1  TEXT,
  sales_contributor_2  TEXT,
  created_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER service_ec_activities_updated_at
  BEFORE UPDATE ON public.service_ec_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_ec_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ec_select" ON public.service_ec_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "ec_insert" ON public.service_ec_activities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ec_update" ON public.service_ec_activities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ec_delete" ON public.service_ec_activities FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
