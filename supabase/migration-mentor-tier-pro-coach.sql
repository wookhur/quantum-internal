-- 전공별 멘토 등급에 '전문코치'(pro_coach, 회당 10만) 추가.
--
-- mentors.type / mentors.tier 칸은 저장소 마이그레이션에 없이 수동으로 추가된
-- 것이라, tier 에 CHECK 제약이 걸려 있는지 환경마다 다를 수 있다.
-- 제약이 있으면 새 등급을 저장할 때 막히므로, 있으면 새 값까지 포함해 다시
-- 만들고 없으면 그대로 둔다. 여러 번 실행해도 안전하다.

-- 칸이 없는 환경(초기 마이그레이션만 돈 경우)을 위해 먼저 보장한다.
alter table public.mentors add column if not exists type text;
alter table public.mentors add column if not exists tier text;

do $mig$
declare
  c record;
  found boolean := false;
begin
  -- tier 를 참조하는 CHECK 제약을 모두 찾아 지운다.
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public'
       and rel.relname = 'mentors'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%tier%'
  loop
    execute format('alter table public.mentors drop constraint %I', c.conname);
    found := true;
    raise notice '기존 tier 제약 % 를 지웠습니다.', c.conname;
  end loop;

  if found then
    -- 원래 제약이 있던 환경에서만 다시 건다(없던 환경에 새로 만들지 않는다).
    alter table public.mentors
      add constraint mentors_tier_check
      check (tier is null or tier in ('college','expert_lt5','expert_gte5','pro_coach'));
    raise notice 'tier 제약을 pro_coach 포함해 다시 만들었습니다.';
  else
    raise notice 'tier 에 CHECK 제약이 없습니다 — 추가 작업 없음.';
  end if;
end
$mig$;

notify pgrst, 'reload schema';
