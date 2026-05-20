-- Student 360 — follow-up commitment checklist
-- Each row is a single follow-up item that can be toggled done/not-done.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS service_followups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES service_students(id) ON DELETE CASCADE,
  diary_id UUID REFERENCES service_diary(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  due_date DATE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_followups_student ON service_followups(student_id);
CREATE INDEX IF NOT EXISTS idx_service_followups_diary ON service_followups(diary_id);
CREATE INDEX IF NOT EXISTS idx_service_followups_done ON service_followups(done);

DROP TRIGGER IF EXISTS set_updated_at ON service_followups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON service_followups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE service_followups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_followups_select_all' AND tablename = 'service_followups') THEN
    CREATE POLICY "service_followups_select_all" ON service_followups FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_followups_insert_all' AND tablename = 'service_followups') THEN
    CREATE POLICY "service_followups_insert_all" ON service_followups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_followups_update_all' AND tablename = 'service_followups') THEN
    CREATE POLICY "service_followups_update_all" ON service_followups FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_followups_delete_all' AND tablename = 'service_followups') THEN
    CREATE POLICY "service_followups_delete_all" ON service_followups FOR DELETE USING (auth.uid() IS NOT NULL);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
