-- ============================================================
-- 컨설턴트 연 관리비 — 회당 정산 방식
-- ------------------------------------------------------------
-- 기존 관리비는 '미팅 2회 = 1개월분'이고 금액은 발행할 때 손으로 적었다.
-- 새 방식은 컨설턴트마다 연 관리비를 정해 두고, 그것을 연 기준 횟수(기본 30회)로
-- 나눈 1회분 단가에 그 달에 진행한 미팅 수를 곱한다.
--
-- 예) 이준형 연 400만원 ÷ 30회 = 1회 133,333원.
--     10월에 3회 진행했으면 '10월 1·2·3회차' 세 줄, 합계 399,999원.
--
-- 여기에 이름이 없는 컨설턴트는 종전 '2회 1개월분' 방식 그대로다.
-- Safe to re-run.
-- ============================================================

create table if not exists public.consultant_annual_fees (
  name_key      text primary key,           -- consultantNameKey(정규화 이름)
  display_name  text not null,              -- 보여줄 이름
  annual_amount integer not null,           -- 연 관리비(원)
  sessions      integer not null default 30,-- 연 기준 횟수 — 1회분 = annual_amount / sessions
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.consultant_annual_fees enable row level security;

-- 열람: 로그인한 직원 전원 (인보이스 금액 산정 근거)
drop policy if exists consultant_annual_fees_read on public.consultant_annual_fees;
create policy consultant_annual_fees_read on public.consultant_annual_fees
  for select to authenticated
  using (true);

-- 입력·수정: 관리자 / C레벨 / 회계
drop policy if exists consultant_annual_fees_write on public.consultant_annual_fees;
create policy consultant_annual_fees_write on public.consultant_annual_fees
  for all to authenticated
  using       (exists (select 1 from public.profiles
                        where id = auth.uid() and role = any (array['admin','c_level','account'])))
  with check  (exists (select 1 from public.profiles
                        where id = auth.uid() and role = any (array['admin','c_level','account'])));

comment on table public.consultant_annual_fees is
  '컨설턴트별 연 관리비. 1회분 단가 = annual_amount / sessions. 여기 없는 사람은 기존 2회 1개월분 방식.';

-- 이준형: 연 400만원 ÷ 30회
insert into public.consultant_annual_fees (name_key, display_name, annual_amount, sessions)
values ('이준형', '이준형', 4000000, 30)
on conflict (name_key) do update
  set display_name  = excluded.display_name,
      annual_amount = excluded.annual_amount,
      sessions      = excluded.sessions,
      updated_at    = now();

notify pgrst, 'reload schema';
