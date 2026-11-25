-- 주간 출근 스케줄 (컨설턴트가 매주 금요일까지 다음 주를 미리 적는다)
--
-- attendances 는 '실제로 몇 시에 찍었나'(지난 일)이고, 이 표는 '다음 주에 언제
-- 나오기로 했나'(앞일)다. 둘은 서로 덮지 않는다 — 계획과 기록을 같은 칸에
-- 넣으면 나중에 어느 쪽이 사실인지 알 수 없게 된다.
--
-- 하루 한 사람 한 줄. 줄이 없으면 '아직 안 적음'이고, 쉬는 날은 kind='off' 로
-- 적어 둔다. '안 적음'과 '쉼'을 같은 것으로 보면 금요일 마감을 챙길 수 없다.

create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  kind text not null default 'office',   -- office(출근) | remote(재택) | off(휴무)
  start_time time,                       -- kind='off' 이면 비워 둔다
  end_time time,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, work_date)
);

create index if not exists idx_work_shifts_date on public.work_shifts(work_date);

alter table public.work_shifts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'work_shifts' and policyname = 'work_shifts_all_auth') then
    create policy "work_shifts_all_auth" on public.work_shifts
      for all to authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
