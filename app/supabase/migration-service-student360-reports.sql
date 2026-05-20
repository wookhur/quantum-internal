-- Student 360 — Archive (required reports) + diary upload links
-- Safe to re-run; uses IF NOT EXISTS.

-- Per-meeting upload links on the diary
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS prep_url TEXT;
ALTER TABLE service_diary ADD COLUMN IF NOT EXISTS summary_url TEXT;

-- Archive: one row per required-report upload (URL only; files live in Google Drive etc.)
CREATE TABLE IF NOT EXISTS service_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES service_students(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'strength_result',     -- 강점분석결과지 (per grade)
    'strength_report',     -- 강점분석보고서 (per grade)
    'grade_report',        -- 성적표 (per grade)
    'grade_analysis',      -- 성적분석보고서 (single, required)
    'other'                -- 기타
  )),
  grade TEXT,              -- e.g. "G10" — used by per-grade categories; nullable
  label TEXT,              -- free-form label, mainly for "other"
  url TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_reports_student ON service_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_category ON service_reports(category);

DROP TRIGGER IF EXISTS set_updated_at ON service_reports;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE service_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_reports_select_all' AND tablename = 'service_reports') THEN
    CREATE POLICY "service_reports_select_all" ON service_reports FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_reports_insert_all' AND tablename = 'service_reports') THEN
    CREATE POLICY "service_reports_insert_all" ON service_reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_reports_update_all' AND tablename = 'service_reports') THEN
    CREATE POLICY "service_reports_update_all" ON service_reports FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_reports_delete_all' AND tablename = 'service_reports') THEN
    CREATE POLICY "service_reports_delete_all" ON service_reports FOR DELETE USING (auth.uid() IS NOT NULL);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
