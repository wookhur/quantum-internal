-- 전사(글로벌) 게시판 표시/숨김. 여기에 route가 있으면 모든 사용자 사이드바에서 숨겨진다.
create table if not exists public.hidden_boards (
  route      text primary key,
  updated_at timestamptz not null default now()
);

alter table public.hidden_boards enable row level security;
create policy "hb_select" on public.hidden_boards for select to authenticated using (true);
create policy "hb_insert" on public.hidden_boards for insert to authenticated with check (true);
create policy "hb_delete" on public.hidden_boards for delete to authenticated using (true);

-- 첫 적용: To-do(내 할일), 메시지 전사 숨김
insert into public.hidden_boards (route) values ('/my-todos'), ('/messages')
on conflict (route) do nothing;

notify pgrst, 'reload schema';
