-- ============================================================
-- 인보이스 통화 (원 / 달러)
-- ------------------------------------------------------------
-- 연 관리비는 원화로만 정할 수 있었고, 인보이스도 전부 원으로 찍혔다.
-- 해외에서 일하는 파트너는 달러로 받는데, 설정에 적을 데가 없어 원화 금액을
-- 넣어 두고 발행할 때마다 사람이 고쳐 적었다.
--
-- 그래서 두 군데에 통화를 둔다.
--  · consultant_annual_fees.currency — '얼마를 무슨 돈으로 받는 사람인가'
--  · freelancer_invoices.currency    — 그 장이 무슨 돈으로 나갔는가
--
-- 인보이스 한 장은 한 통화다. 한 장 안에 원과 달러가 섞이면 합계를 낼 수 없다.
-- 기본값은 원이라 지금 있는 설정·인보이스는 하나도 달라지지 않는다.
-- Safe to re-run.
-- ============================================================

alter table public.consultant_annual_fees
  add column if not exists currency text not null default 'KRW';

alter table public.freelancer_invoices
  add column if not exists currency text not null default 'KRW';

-- 값 제한은 따로 건다 (add column ... check 는 재실행 때 이름이 겹친다)
do $$
declare c record;
begin
  for c in
    select rel.relname as tbl, con.conname as name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('consultant_annual_fees', 'freelancer_invoices')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%currency%'
  loop
    execute format('alter table public.%I drop constraint %I', c.tbl, c.name);
  end loop;
end $$;

alter table public.consultant_annual_fees
  add constraint consultant_annual_fees_currency_check
  check (currency in ('KRW', 'USD'));

alter table public.freelancer_invoices
  add constraint freelancer_invoices_currency_check
  check (currency in ('KRW', 'USD'));

-- 달러는 센트까지 적는다. 연 관리비 칸이 정수형이면 $2,500.50 이 들어가지 않는다.
alter table public.consultant_annual_fees
  alter column annual_amount type numeric(14, 2);

comment on column public.consultant_annual_fees.currency is
  'KRW | USD. 이 사람의 연 관리비 통화이자, 그 사람 인보이스의 기본 통화.';
comment on column public.freelancer_invoices.currency is
  'KRW | USD. 인보이스 한 장은 한 통화다(한 장에 섞으면 합계를 낼 수 없다).';

notify pgrst, 'reload schema';
