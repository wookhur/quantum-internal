-- 원서·에세이 서비스 플랜 (컨설턴트 월 급여 자동계산용)
-- 학생별로 담당 컨설턴트 + 총 급여 + 시작월(신청월)을 등록하면,
-- 인보이스 발행 시 (총액 ÷ 시작월~그해 12월 개월수)가 매월 자동 반영된다.
create table if not exists public.essay_service_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.service_students(id) on delete cascade,
  consultant_name text,               -- 담당 컨설턴트(급여 대상). 기본 = 학생 담당 컨설턴트
  total_amount numeric not null default 0,
  start_month text not null,          -- 신청월 'YYYY-MM' (종료월은 그해 12월 자동)
  currency text default 'KRW',
  notes text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_essay_plans_student on public.essay_service_plans(student_id);

alter table public.essay_service_plans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'essay_service_plans' and policyname = 'essay_all_auth') then
    create policy "essay_all_auth" on public.essay_service_plans
      for all to authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
