-- ============================================================
-- 수금 메모 — 계약별로 쌓이는 기록
-- ------------------------------------------------------------
-- 납입 일정이 바뀌는 일은 흔하다. 날짜를 미루고, 현금으로 일부만 받고,
-- 환율 때문에 쪼개 보낸다. 그런데 그 사정을 적어 둘 데가 없어 계약서 여백에
-- 손으로 적히거나(김민준 건의 '잔금 500만 현금 지급예정'처럼) 아무 데도 안 남았다.
-- 남지 않으면 나중에 숫자가 왜 이런지 아무도 모른다.
--
-- 한 칸짜리 메모가 아니라 쌓이는 기록으로 둔다. 덮어쓰면 "언제 무엇이 바뀌었나"가
-- 사라지는데, 수금에서 알고 싶은 건 바로 그것이다.
-- Safe to re-run.
-- ============================================================

create table if not exists public.contract_payment_notes (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  content     text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  -- 작성 당시 이름을 함께 남긴다 — 퇴사해 프로필이 지워져도 누가 썼는지 남아야 한다
  author_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_contract_payment_notes_contract
  on public.contract_payment_notes(contract_id, created_at desc);

comment on table public.contract_payment_notes is
  '수금 메모. 입금 일정 변경·분할 입금·현금 수령 등 숫자만으로는 알 수 없는 사정을 남긴다.';

-- '수정됨' 표시가 맞으려면 updated_at 이 저절로 갱신돼야 한다
drop trigger if exists set_contract_payment_notes_updated_at on public.contract_payment_notes;
create trigger set_contract_payment_notes_updated_at
  before update on public.contract_payment_notes
  for each row execute function public.set_updated_at();

alter table public.contract_payment_notes enable row level security;

-- 열람: 로그인한 직원 전원 (계약을 함께 보는 사람들이 사정을 알아야 한다)
drop policy if exists contract_payment_notes_select on public.contract_payment_notes;
create policy contract_payment_notes_select on public.contract_payment_notes
  for select to authenticated using (true);

drop policy if exists contract_payment_notes_insert on public.contract_payment_notes;
create policy contract_payment_notes_insert on public.contract_payment_notes
  for insert to authenticated with check (auth.uid() is not null);

-- 수정·삭제: 쓴 사람 또는 관리자급
drop policy if exists contract_payment_notes_update on public.contract_payment_notes;
create policy contract_payment_notes_update on public.contract_payment_notes
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin_level())
  with check (created_by = auth.uid() or public.is_admin_level());

drop policy if exists contract_payment_notes_delete on public.contract_payment_notes;
create policy contract_payment_notes_delete on public.contract_payment_notes
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin_level());

notify pgrst, 'reload schema';
