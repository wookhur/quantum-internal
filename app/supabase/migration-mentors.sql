-- 학습코칭 멘토 풀 + 학생별 코칭 배정
-- Run once in the Supabase SQL editor.

create table if not exists public.mentors (
  id           uuid primary key default gen_random_uuid(),
  korean_name  text,
  english_name text,
  birth_year   int,
  school       text,     -- 재학중 학교
  major        text,     -- 전공
  phone        text,
  email        text,
  subjects     text,     -- 멘토링 가능한 과목
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger mentors_updated_at before update on public.mentors
  for each row execute function public.set_updated_at();

create table if not exists public.student_coaching (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.service_students(id) on delete cascade,
  mentor_id   uuid references public.mentors(id) on delete set null,
  start_date  date,
  schedule    text,     -- 코칭 스케줄 (예: 주3회, 월/목/토)
  field_notes text,     -- 코칭 분야 메모
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger student_coaching_updated_at before update on public.student_coaching
  for each row execute function public.set_updated_at();

alter table public.mentors enable row level security;
alter table public.student_coaching enable row level security;

create policy "mentors_select" on public.mentors for select to authenticated using (true);
create policy "mentors_insert" on public.mentors for insert to authenticated with check (true);
create policy "mentors_update" on public.mentors for update to authenticated using (true) with check (true);
create policy "mentors_delete" on public.mentors for delete to authenticated using (true);

create policy "coaching_select" on public.student_coaching for select to authenticated using (true);
create policy "coaching_insert" on public.student_coaching for insert to authenticated with check (true);
create policy "coaching_update" on public.student_coaching for update to authenticated using (true) with check (true);
create policy "coaching_delete" on public.student_coaching for delete to authenticated using (true);

notify pgrst, 'reload schema';
