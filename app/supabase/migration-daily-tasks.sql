-- 일일 업무(Daily Task) 1단계
-- 재실행 안전.

-- 1) 작성 대상자 명단 (관리자가 일일 업무 화면에서 지정)
CREATE TABLE IF NOT EXISTS public.daily_task_members (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) 일일 업무 기록
CREATE TABLE IF NOT EXISTS public.daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- 담당자
  task_date date NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',   -- in_progress | done
  source_type text NOT NULL DEFAULT 'manual',   -- manual | task_request
  source_task_id uuid,                          -- 연결된 업무요청(tasks.id)
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON public.daily_tasks (task_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_user ON public.daily_tasks (user_id);

-- RLS: 전 직원 열람(투명성), 작성/수정은 인증 사용자(앱에서 대상자·본인 여부로 게이팅)
ALTER TABLE public.daily_task_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_task_members_all ON public.daily_task_members;
CREATE POLICY daily_task_members_all ON public.daily_task_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS daily_tasks_all ON public.daily_tasks;
CREATE POLICY daily_tasks_all ON public.daily_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
