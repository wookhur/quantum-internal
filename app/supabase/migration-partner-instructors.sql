-- 파트너 강사 레지스트리 (외부 파트너사 직원). 사내 프로필과 별개로 이메일로 관리.
--  email / academy(소속학원) / subject(담당과목) / notes(특이사항) / enabled_routes(접근가능 게시판)
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.partner_instructors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL,
  academy        text,
  subject        text,
  notes          text,
  student_ids    text[] NOT NULL DEFAULT '{}',   -- 담당학생 (service_students.id)
  enabled_routes text[] NOT NULL DEFAULT '{}',
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- for tables created before student_ids existed
ALTER TABLE public.partner_instructors
  ADD COLUMN IF NOT EXISTS student_ids text[] NOT NULL DEFAULT '{}';

-- one row per email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS partner_instructors_email_key
  ON public.partner_instructors (lower(email));

DROP TRIGGER IF EXISTS set_updated_at ON public.partner_instructors;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.partner_instructors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_instructors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_instructors_all" ON public.partner_instructors;
CREATE POLICY "partner_instructors_all" ON public.partner_instructors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
