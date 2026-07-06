-- Leave management (연차관리): employees request leave, holders of the
-- '연차·휴가 승인' permission approve. Annual-leave balance is computed in-app
-- from hire date. Safe to re-run.

-- Per-user '연차·휴가 승인' permission (assigned in 인사관리 → 특수 권한)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_approve_leave BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  leave_type    TEXT NOT NULL DEFAULT 'annual',   -- annual | family_event | other
  event_type    TEXT,                             -- family_event subtype key
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days          NUMERIC NOT NULL DEFAULT 1,
  paid          BOOLEAN NOT NULL DEFAULT true,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'requested', -- requested | approved | rejected
  approved_by   UUID,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_requester ON public.leave_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON public.leave_requests(status);

DROP TRIGGER IF EXISTS leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_requests_update" ON public.leave_requests;
DROP POLICY IF EXISTS "leave_requests_delete" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "leave_requests_insert" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "leave_requests_update" ON public.leave_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leave_requests_delete" ON public.leave_requests FOR DELETE TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
