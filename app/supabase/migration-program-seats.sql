-- ② 외부서비스 좌석 배정판: 프로그램(정원 관리) + 좌석 배정
-- Run once in the Supabase SQL editor.

-- 프로그램 목록 (관리자가 화면에서 추가/수정). capacity = 학년당 정원.
CREATE TABLE IF NOT EXISTS public.service_programs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  group_name  TEXT,
  capacity    INT NOT NULL DEFAULT 5,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 좌석 배정 (프로그램 × 학생). 학년은 학생의 grade에서 파생.
CREATE TABLE IF NOT EXISTS public.program_seat_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES public.service_programs(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.service_students(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, student_id)
);

CREATE TRIGGER service_programs_updated_at
  BEFORE UPDATE ON public.service_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_seat_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sp_select" ON public.service_programs FOR SELECT TO authenticated USING (true);
CREATE POLICY "sp_insert" ON public.service_programs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sp_update" ON public.service_programs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "sp_delete" ON public.service_programs FOR DELETE TO authenticated USING (true);

CREATE POLICY "psa_select" ON public.program_seat_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "psa_insert" ON public.program_seat_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "psa_update" ON public.program_seat_assignments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "psa_delete" ON public.program_seat_assignments FOR DELETE TO authenticated USING (true);

-- 초기 7개 프로그램 (학년당 정원)
INSERT INTO public.service_programs (key, name, group_name, capacity, sort_order) VALUES
  ('kyn',          'KYN',          NULL,             9,  1),
  ('milkit',       '밀키트사업',   '중동전쟁난민센터', 5,  2),
  ('bongsa',       '봉사',         '중동전쟁난민센터', 5,  3),
  ('lee_woorin',   '이우린박사님', NULL,             5,  4),
  ('lgm_research', '리서치',       '이광미원장님',    5,  5),
  ('lgm_class',    '수업',         '이광미원장님',    10, 6),
  ('next_bound',   'Next Bound',   NULL,             5,  7)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
