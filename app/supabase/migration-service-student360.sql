-- Student 360 (서비스팀 학생 통합 관리)
-- Tables: service_students, service_meetings, service_diary
-- All records are entered through the site; data lives entirely in Supabase.
-- RLS follows the open "todos" model: any authenticated user can read/write.

-- =============================================
-- 1. STUDENT PROFILE
-- =============================================
CREATE TABLE IF NOT EXISTS service_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  english_name TEXT,
  school TEXT,
  grade TEXT,
  parent_name TEXT,
  contact TEXT,
  assigned_consultant TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_students_name ON service_students(name);
CREATE INDEX IF NOT EXISTS idx_service_students_consultant ON service_students(assigned_consultant);

-- =============================================
-- 2. MEETINGS + REPORT LOG
-- =============================================
CREATE TABLE IF NOT EXISTS service_meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES service_students(id) ON DELETE CASCADE,
  meeting_date DATE,
  meeting_type TEXT,
  consultant_id TEXT,
  summary TEXT,
  report_status TEXT NOT NULL DEFAULT 'none' CHECK (report_status IN ('none', 'pending', 'submitted')),
  report_url TEXT,
  report_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_meetings_student ON service_meetings(student_id);
CREATE INDEX IF NOT EXISTS idx_service_meetings_date ON service_meetings(meeting_date);

-- =============================================
-- 3. MEETING DIARY
-- =============================================
CREATE TABLE IF NOT EXISTS service_diary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES service_students(id) ON DELETE CASCADE,
  entry_date DATE,
  category TEXT,
  content TEXT,
  author_id TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_diary_student ON service_diary(student_id);
CREATE INDEX IF NOT EXISTS idx_service_diary_date ON service_diary(entry_date);

-- =============================================
-- 4. updated_at triggers
-- =============================================
DROP TRIGGER IF EXISTS set_updated_at ON service_students;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON service_meetings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON service_diary;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_diary
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 5. Row Level Security (open to authenticated users)
-- =============================================
ALTER TABLE service_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_diary   ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['service_students', 'service_meetings', 'service_diary']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = tbl || '_select_all' AND tablename = tbl) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (auth.uid() IS NOT NULL)', tbl || '_select_all', tbl);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = tbl || '_insert_all' AND tablename = tbl) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)', tbl || '_insert_all', tbl);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = tbl || '_update_all' AND tablename = tbl) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (auth.uid() IS NOT NULL)', tbl || '_update_all', tbl);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = tbl || '_delete_all' AND tablename = tbl) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (auth.uid() IS NOT NULL)', tbl || '_delete_all', tbl);
    END IF;
  END LOOP;
END
$$;
