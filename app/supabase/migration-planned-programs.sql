-- 예정 프로그램(준비 예상 리스트) — EC 프로그램 관리에서 직접 추가. Safe to re-run.
CREATE TABLE IF NOT EXISTS public.service_planned_programs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name  TEXT NOT NULL,
  partner       TEXT,
  program       TEXT,
  planned_date  DATE,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'planned',  -- planned | done
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS service_planned_programs_updated_at ON public.service_planned_programs;
CREATE TRIGGER service_planned_programs_updated_at
  BEFORE UPDATE ON public.service_planned_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_planned_programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_planned_programs_all" ON public.service_planned_programs;
CREATE POLICY "service_planned_programs_all" ON public.service_planned_programs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
