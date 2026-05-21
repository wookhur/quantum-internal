-- Service Dashboard: student milestones (EC activities, application deadlines, exam dates)
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS student_milestones (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID        NOT NULL REFERENCES service_students(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL
                             CHECK (type IN ('strategy','essay','application','competition','decision','ec_activity')),
  title          TEXT        NOT NULL,
  date           DATE        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'upcoming'
                             CHECK (status IN ('on_track','behind','urgent','completed','upcoming')),
  notes          TEXT,
  created_by     UUID        REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_milestones_student ON student_milestones(student_id);
CREATE INDEX IF NOT EXISTS idx_student_milestones_date    ON student_milestones(date);

DROP TRIGGER IF EXISTS set_updated_at ON student_milestones;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON student_milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE student_milestones ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT := 'student_milestones';
BEGIN
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
END$$;

NOTIFY pgrst, 'reload schema';
