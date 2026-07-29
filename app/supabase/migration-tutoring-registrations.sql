-- 과외강사관리: 학생별 과외 신청 등록. 신청완료(completed) 시 학생 Student360의
-- academic support(service_academic_support)에 자동 연동(수업제목='{과외선생님} 1:1', 시작일).
create table if not exists public.tutoring_registrations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.service_students(id) on delete cascade,
  tutor_name text not null,               -- 과외선생님 이름
  subject text,                            -- 과목(선택)
  start_date date,                         -- 시작일
  status text not null default 'applied',  -- 'applied'(신청) | 'completed'(신청완료)
  academic_support_id uuid,                -- 신청완료 시 생성된 academic support 연동(중복 방지)
  notes text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_tutoring_student on public.tutoring_registrations(student_id);
create index if not exists idx_tutoring_tutor on public.tutoring_registrations(tutor_name);

alter table public.tutoring_registrations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='tutoring_registrations' and policyname='tutoring_all_auth') then
    create policy "tutoring_all_auth" on public.tutoring_registrations for all to authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
