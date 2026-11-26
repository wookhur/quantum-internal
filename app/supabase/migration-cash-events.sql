-- 자금 흐름표 — 날짜순 잔액 추적
--
-- 수금은 계약관리(payment_installments)에서 저절로 들어오고, 매달 같은 날 나가는
-- 돈은 fixed_expenses 가 들고 있다. 여기 담는 것은 그 둘로 설명되지 않는 단건이다 —
-- 기준 잔고, 대출 입금·상환, 인테리어 잔금 같은 것.
--
-- 부호를 금액에 직접 넣는다. 나가는 돈은 음수. 종류(kind)로 부호를 유추하면
-- '대출 상환인데 환급받았다' 같은 예외에서 손댈 곳이 늘어난다.

create table if not exists public.cash_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  label text not null,
  amount numeric not null,                 -- 들어오면 +, 나가면 −
  kind text not null default 'other',      -- opening | loan_in | loan_out | onetime_in | onetime_out | other
  currency text not null default 'KRW',
  settled boolean not null default false,  -- 실제로 입금·집행이 끝났나
  notes text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cash_events_date on public.cash_events(event_date);

alter table public.cash_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cash_events' and policyname = 'cash_events_all_auth') then
    create policy "cash_events_all_auth" on public.cash_events
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 고정비가 '매달 며칠에' 나가는지 알아야 날짜순 표를 그릴 수 있다.
-- 급여는 5일, 임대료·운영자금은 30일처럼 날이 다르고, 그 차이 때문에 같은 달
-- 안에서도 통장이 비는 시점이 갈린다.
alter table public.fixed_expenses
  add column if not exists pay_day smallint not null default 5,
  add column if not exists start_month text,   -- 'YYYY-MM' 이 달부터 (없으면 제한 없음)
  add column if not exists end_month text;     -- 'YYYY-MM' 이 달까지

comment on column public.fixed_expenses.pay_day is
  '매달 며칠에 나가는가(1~31). 그 달에 없는 날이면 말일로 당긴다.';

notify pgrst, 'reload schema';
