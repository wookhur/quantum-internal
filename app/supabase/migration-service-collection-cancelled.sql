-- ============================================================
-- 서비스입금관리 수금상태에 '발생취소' 추가
-- ------------------------------------------------------------
-- 수금상태가 두 단계(미수금 / 수금 완료)뿐이었다. 이 둘은 입금금액·입금일에서
-- 자동으로 잡히는 값이다. 그런데 돈은 들어왔지만 인센티브는 발생시키지 않는 건이 있다 —
-- 원가로 진행해 수익쉐어가 없는 건, 발생해야 할 인센티브를 접은 건 등.
--
-- 지금까지는 그런 건을 표시할 데가 없어 '미수금'으로 두거나(안 들어온 돈처럼 보인다)
-- 기여자 팀을 '없음'으로 돌렸다(그 사람의 인센티브만 빠지고, 왜 빠졌는지가 안 남는다).
-- 그래서 세 번째 상태를 둔다.
--
-- 발생취소는 '미수금'이 아니다. 입금금액·입금일은 그대로 남고, 수금 총액에도 들어간다.
-- 빠지는 것은 인센티브뿐이다.
--
-- 수기 입금(service_manual_fees)에는 미수금이 없다 — 들어온 돈을 적는 칸이다.
-- 다만 요율 칸이 0을 받지 않아(check incentive_rate > 0) 인센티브만 접을 길이 없었다.
-- 지우면 들어온 돈의 기록까지 사라지므로 여기에도 발생취소를 둔다.
-- Safe to re-run.
-- ============================================================

-- 수기 입금에도 수금상태 칸을 둔다 (기본값 = 수금 완료)
alter table public.service_manual_fees
  add column if not exists collection_status text not null default 'paid';

-- 기존 CHECK 는 ('pending','paid') 만 허용한다. 이름이 테이블마다 다를 수 있어
-- collection_status 를 쓰는 CHECK 를 찾아 걷어낸 뒤 다시 건다 (재실행 가능).
do $$
declare c record;
begin
  for c in
    select rel.relname as tbl, con.conname as name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('service_ec_activities', 'service_academic_support', 'service_manual_fees')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%collection_status%'
  loop
    execute format('alter table public.%I drop constraint %I', c.tbl, c.name);
  end loop;
end $$;

alter table public.service_ec_activities
  add constraint service_ec_activities_collection_status_check
  check (collection_status in ('pending', 'paid', 'cancelled'));

alter table public.service_academic_support
  add constraint service_academic_support_collection_status_check
  check (collection_status in ('pending', 'paid', 'cancelled'));

alter table public.service_manual_fees
  add constraint service_manual_fees_collection_status_check
  check (collection_status in ('paid', 'cancelled'));

comment on column public.service_ec_activities.collection_status is
  'pending=미수금, paid=수금 완료(인센티브 발생), cancelled=발생취소(입금 기록은 남고 인센티브만 빠진다)';
comment on column public.service_academic_support.collection_status is
  'pending=미수금, paid=수금 완료(인센티브 발생), cancelled=발생취소(입금 기록은 남고 인센티브만 빠진다)';
comment on column public.service_manual_fees.collection_status is
  'paid=수금 완료(인센티브 발생), cancelled=발생취소. 수기 건은 들어온 돈을 적는 칸이라 미수금이 없다.';

notify pgrst, 'reload schema';
