-- 대시보드 회사 일반 정보(주소·홈페이지·학생관리앱·은행계좌·대표 연락처). 단일 행.
-- 전 직원+파트너 열람, 편집은 앱에서 관리자로 게이팅. 재실행 안전.
CREATE TABLE IF NOT EXISTS public.company_info (
  id text PRIMARY KEY DEFAULT 'main',
  address text,
  website text,
  student_app_url text,
  bank_info text,
  company_phone text,
  company_email text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.company_info (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_info_all ON public.company_info;
CREATE POLICY company_info_all ON public.company_info
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
