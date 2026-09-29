-- 인보이스 수정이 조용히 실패하는 원인 확인 (권한/RLS) + 피해 범위 파악
--
-- 증상 두 가지는 같은 뿌리에서 나온다 — '저장이 안 됐는데 에러가 안 뜬다'.
--   · 금액은 바뀌었는데 항목이 사라짐 → 항목 insert 가 막혔는데 에러를 무시했다
--   · 항목은 바뀌는데 금액이 그대로  → 인보이스 update 가 RLS 로 0행만 바꿨다
--     (PostgREST 는 RLS 로 0행이 바뀌어도 에러를 주지 않는다)
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.

-- 1) 두 테이블의 RLS 정책 — 누가 UPDATE/INSERT/DELETE 할 수 있는지
select tablename  as 테이블,
       policyname as 정책명,
       cmd        as 동작,
       roles      as 역할,
       qual       as "읽기조건(USING)",
       with_check as "쓰기조건(WITH CHECK)"
  from pg_policies
 where tablename in ('freelancer_invoices', 'freelancer_invoice_items')
 order by tablename, cmd, policyname;

-- 2) RLS 자체가 켜져 있는지
select relname as 테이블, relrowsecurity as RLS사용, relforcerowsecurity as 강제
  from pg_class
 where relname in ('freelancer_invoices', 'freelancer_invoice_items');

-- 3) 피해 범위 — 금액은 있는데 항목이 하나도 없는 인보이스 (항목이 지워진 건)
select i.id,
       i.invoice_month as 정산월,
       coalesce(p.name, i.client_name) as 발행인,
       i.client_name  as 수령인,
       i.total_amount as 금액,
       i.status       as 상태,
       i.updated_at   as 마지막수정
  from freelancer_invoices i
  left join profiles p on p.id = i.freelancer_id
 where coalesce(i.total_amount, 0) > 0
   and not exists (select 1 from freelancer_invoice_items it where it.invoice_id = i.id)
 order by i.updated_at desc nulls last;

-- 4) 금액과 항목 합계가 어긋난 인보이스 (금액만 안 바뀐 건)
select i.id,
       i.invoice_month as 정산월,
       coalesce(p.name, i.client_name) as 발행인,
       i.total_amount  as 인보이스금액,
       sum(it.supply_amount) as 항목합계,
       i.total_amount - sum(it.supply_amount) as 차이,
       i.updated_at    as 마지막수정
  from freelancer_invoices i
  join freelancer_invoice_items it on it.invoice_id = i.id
  left join profiles p on p.id = i.freelancer_id
 group by i.id, i.invoice_month, p.name, i.client_name, i.total_amount, i.updated_at
having i.total_amount is distinct from sum(it.supply_amount)
 order by i.updated_at desc nulls last;
