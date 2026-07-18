-- 파트너 프로그램 관리
--  파트너사가 운영하는 프로그램을 문의→관심→신청→완료 단계로 관리.
--  콜드콜/리드관리의 리드를 프로그램에 연결하고, 통화/카톡 소통 기록을 남기며,
--  브로셔 이미지를 업로드해 안내(가이드)를 자동 정리/공유한다. Safe to re-run.

-- ── 프로그램 마스터 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_programs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_company_id uuid REFERENCES public.partner_companies(id) ON DELETE SET NULL,
  name               text NOT NULL,
  guide              text,                    -- 프로그램 안내 (브로셔에서 자동 정리 + 수동 편집)
  brochure_url       text,                    -- 업로드한 브로셔 이미지 URL
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.partner_programs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.partner_programs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 프로그램에 연결된 리드 (단계별) ─────────────────────────────
--  stage: inquiry(문의) | interest(관심) | application(신청) | completed(완료)
CREATE TABLE IF NOT EXISTS public.partner_program_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  uuid NOT NULL REFERENCES public.partner_programs(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage       text NOT NULL DEFAULT 'inquiry',
  note        text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_program_entries_key
  ON public.partner_program_entries (program_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_partner_program_entries_program
  ON public.partner_program_entries (program_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.partner_program_entries;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.partner_program_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 소통 기록 (통화/카톡 등) ────────────────────────────────────
--  method: call | katalk | sms | other
CREATE TABLE IF NOT EXISTS public.partner_program_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES public.partner_program_entries(id) ON DELETE CASCADE,
  method      text NOT NULL DEFAULT 'call',
  content     text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_program_comments_entry
  ON public.partner_program_comments (entry_id);

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.partner_programs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_program_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_program_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_programs_all" ON public.partner_programs;
CREATE POLICY "partner_programs_all" ON public.partner_programs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "partner_program_entries_all" ON public.partner_program_entries;
CREATE POLICY "partner_program_entries_all" ON public.partner_program_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "partner_program_comments_all" ON public.partner_program_comments;
CREATE POLICY "partner_program_comments_all" ON public.partner_program_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 브로셔 이미지 스토리지 버킷 ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-brochures', 'partner-brochures', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "partner_brochures_read" ON storage.objects;
CREATE POLICY "partner_brochures_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'partner-brochures');

DROP POLICY IF EXISTS "partner_brochures_write" ON storage.objects;
CREATE POLICY "partner_brochures_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'partner-brochures');

DROP POLICY IF EXISTS "partner_brochures_update" ON storage.objects;
CREATE POLICY "partner_brochures_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'partner-brochures');

DROP POLICY IF EXISTS "partner_brochures_delete" ON storage.objects;
CREATE POLICY "partner_brochures_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'partner-brochures');

NOTIFY pgrst, 'reload schema';
