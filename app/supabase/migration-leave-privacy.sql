-- Leave request visibility: a user sees their OWN requests + any APPROVED
-- request (for the shared calendar). Approvers/admin see everything.
-- Safe to re-run.

DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR status = 'approved'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND (role = 'admin' OR can_approve_leave = true)
    )
  );

NOTIFY pgrst, 'reload schema';
