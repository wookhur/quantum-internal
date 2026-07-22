-- Student360 Issue Report section: per-student issue reports + comments.
-- Private (locked) issues are visible only to their author consultant and admin-level users.
-- Admin-level users are notified when an issue is created (done app-side).
-- Safe to re-run.

-- ── issue_reports ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.issue_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES public.service_students(id) ON DELETE CASCADE,
  report_date  DATE NOT NULL DEFAULT current_date,
  content      TEXT NOT NULL,
  is_private   BOOLEAN NOT NULL DEFAULT false,   -- lock: author + admin only
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_reports_student ON public.issue_reports(student_id);

DROP TRIGGER IF EXISTS issue_reports_updated_at ON public.issue_reports;
CREATE TRIGGER issue_reports_updated_at
  BEFORE UPDATE ON public.issue_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── issue_report_comments (feedback / solutions) ───────────────
CREATE TABLE IF NOT EXISTS public.issue_report_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id     UUID NOT NULL REFERENCES public.issue_reports(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issue_report_comments_issue ON public.issue_report_comments(issue_id);

-- ── helper: is the current user admin-level ────────────────────
CREATE OR REPLACE FUNCTION public.is_admin_level() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','c_level'));
$$;

-- ── RLS: private issues visible only to author + admin ─────────
ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_reports_select" ON public.issue_reports;
CREATE POLICY "issue_reports_select" ON public.issue_reports FOR SELECT TO authenticated
  USING (is_private = false OR created_by = auth.uid() OR public.is_admin_level());
DROP POLICY IF EXISTS "issue_reports_insert" ON public.issue_reports;
CREATE POLICY "issue_reports_insert" ON public.issue_reports FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "issue_reports_update" ON public.issue_reports;
CREATE POLICY "issue_reports_update" ON public.issue_reports FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin_level()) WITH CHECK (true);
DROP POLICY IF EXISTS "issue_reports_delete" ON public.issue_reports;
CREATE POLICY "issue_reports_delete" ON public.issue_reports FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin_level());

ALTER TABLE public.issue_report_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_comments_select" ON public.issue_report_comments;
CREATE POLICY "issue_comments_select" ON public.issue_report_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.issue_reports ir WHERE ir.id = issue_id
    AND (ir.is_private = false OR ir.created_by = auth.uid() OR public.is_admin_level())));
DROP POLICY IF EXISTS "issue_comments_insert" ON public.issue_report_comments;
CREATE POLICY "issue_comments_insert" ON public.issue_report_comments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.issue_reports ir WHERE ir.id = issue_id
    AND (ir.is_private = false OR ir.created_by = auth.uid() OR public.is_admin_level())));
DROP POLICY IF EXISTS "issue_comments_delete" ON public.issue_report_comments;
CREATE POLICY "issue_comments_delete" ON public.issue_report_comments FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin_level());

NOTIFY pgrst, 'reload schema';
