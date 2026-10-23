-- ============================================================
-- 서비스입금관리 — 수기 입금 내역
-- ------------------------------------------------------------
-- 서비스입금관리의 항목은 Student 360 의 EC·학습지원 입력에서 자동으로 올라온다.
-- 그런데 정기 수업이 아니라 달마다 불규칙하게 수업하고 그때그때 정산금이 들어오는
-- 경우가 있다. 이런 건 360 에 걸 프로그램이 없어 어디에도 기록되지 않았고,
-- 인센티브도 잡히지 않았다.
--
-- 그래서 학생·정산월·입금액·요율·담당자만 손으로 적는 칸을 둔다.
-- 읽는 쪽(useAllServiceProgramFees)에서 EC·학습지원과 한 줄기로 합치므로,
-- 재무 대시보드와 개인 인센티브 인보이스에는 따로 손대지 않아도 함께 나온다.
--
-- 인센티브 = 입금액 × 요율. 요율은 파트너사 수수료표가 아니라 건별로 직접 고른다
-- (불규칙 정산이라 파트너사 기준율이 맞지 않는다).
-- Safe to re-run.
-- ============================================================

create table if not exists public.service_manual_fees (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.service_students(id) on delete cascade,
  -- 정산월 'YYYY-MM'. 이 달이 곧 인센티브가 잡히는 달이다.
  settlement_month    text not null check (settlement_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- 무엇에 대한 정산인지 (선택). 비워 두면 목록에서 '수기 정산' 으로만 보인다.
  title               text,
  billed_amount       numeric not null check (billed_amount >= 0),
  currency            text not null default 'KRW',
  -- 1~10(%) 를 화면에서 고르지만, 나중에 다른 율이 필요할 수 있어 범위만 막아 둔다
  incentive_rate      numeric not null check (incentive_rate > 0 and incentive_rate <= 100),
  sales_contributor_1 text,
  note                text,
  created_by          uuid references public.profiles(id) on delete set null,
  author_name         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_service_manual_fees_student
  on public.service_manual_fees(student_id, settlement_month desc);
create index if not exists idx_service_manual_fees_month
  on public.service_manual_fees(settlement_month desc);

comment on table public.service_manual_fees is
  '서비스입금관리의 수기 입금 내역. 불규칙 수업 정산처럼 Student360 프로그램에 걸 수 없는 건을 손으로 적는다.';
comment on column public.service_manual_fees.settlement_month is
  '정산월 YYYY-MM. 이 달이 인센티브가 잡히는 달이 된다.';
comment on column public.service_manual_fees.incentive_rate is
  '인센티브 요율(%). 파트너사 수수료표가 아니라 건별로 직접 고른다.';

drop trigger if exists set_service_manual_fees_updated_at on public.service_manual_fees;
create trigger set_service_manual_fees_updated_at
  before update on public.service_manual_fees
  for each row execute function public.set_updated_at();

alter table public.service_manual_fees enable row level security;

-- 열람: 로그인한 직원 전원 (서비스입금관리·재무 대시보드에서 함께 본다)
drop policy if exists service_manual_fees_select on public.service_manual_fees;
create policy service_manual_fees_select on public.service_manual_fees
  for select to authenticated using (true);

drop policy if exists service_manual_fees_insert on public.service_manual_fees;
create policy service_manual_fees_insert on public.service_manual_fees
  for insert to authenticated with check (auth.uid() is not null);

-- 수정·삭제: 적은 사람 또는 관리자급. 인센티브로 이어지는 돈이라 아무나 못 고친다.
drop policy if exists service_manual_fees_update on public.service_manual_fees;
create policy service_manual_fees_update on public.service_manual_fees
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin_level())
  with check (created_by = auth.uid() or public.is_admin_level());

drop policy if exists service_manual_fees_delete on public.service_manual_fees;
create policy service_manual_fees_delete on public.service_manual_fees
  for delete to authenticated
  using (created_by = auth.uid() or public.is_admin_level());

notify pgrst, 'reload schema';
