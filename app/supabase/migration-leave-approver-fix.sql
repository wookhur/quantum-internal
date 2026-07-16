-- 연차/휴가 승인 알림 + 승인자 가시성 안정화.
--  (1) is_leave_approver(): 현재 사용자가 승인자(admin 또는 can_approve_leave)인지 판별 (RLS 서브쿼리 대체)
--  (2) leave_requests SELECT 정책을 이 함수로 재작성 (profiles RLS에 좌우되지 않도록)
--  (3) notify_leave_approvers(): 신청 시 승인자 전원에게 알림 삽입 (신청자 세션의 RLS 우회)
-- Safe to re-run.

-- (1)
CREATE OR REPLACE FUNCTION public.is_leave_approver()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR can_approve_leave = true)
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_leave_approver() TO authenticated;

-- (2) 본인 신청 + 승인완료(공유 캘린더) + 승인자는 전체
DROP POLICY IF EXISTS "leave_requests_select" ON public.leave_requests;
CREATE POLICY "leave_requests_select" ON public.leave_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR status = 'approved'
    OR public.is_leave_approver()
  );

-- (3) 신청 시 승인자 전원에게 알림
CREATE OR REPLACE FUNCTION public.notify_leave_approvers(
  p_requester_name text, p_start text, p_end text, p_days numeric
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  INSERT INTO public.user_notifications (user_id, type, title, message, link, metadata, is_read)
  SELECT p.id, 'leave_request', '휴가 승인 요청',
         p_requester_name || '님이 ' || p_start || ' ~ ' || p_end || ' 휴가(' || p_days::text || '일)를 신청했습니다.',
         '/hr/leave', '{}'::jsonb, false
    FROM public.profiles p
    WHERE p.role = 'admin' OR p.can_approve_leave = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.notify_leave_approvers(text, text, text, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
