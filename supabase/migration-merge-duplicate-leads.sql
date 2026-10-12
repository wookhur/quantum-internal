-- ============================================================
-- 중복 리드 일괄 병합
-- ------------------------------------------------------------
-- 같은 사람이 여러 줄로 들어와 있다. 원인은 구글시트 동기화 두 가지 결함이었다.
--   1) 중복 판정용 기존 리드 목록이 1000행에서 잘렸다(페이지 처리 없음).
--      리드가 그보다 많아진 뒤로는 뒤쪽 사람이 판정에 아예 안 걸렸다.
--   2) 전화번호를 정규화한 쪽과 날것인 쪽을 비교했다.
--      '010-5278-3204' 와 '01052783204' 가 다른 사람이 됐다.
-- 둘 다 edge function 에서 고쳤다. 이 SQL 은 이미 쌓인 중복을 정리한다.
--
-- 같은 사람 판정 = (이메일) 또는 (전화 9자리 이상) + 학생 이름.
-- 앱의 dedupeLeadsByPerson 과 같은 기준이라, 같은 집 형제자매는 합치지 않는다.
--
-- 대표 리드는 이 순서로 고른다: 더 진행된 단계 → 딸린 기록이 많은 쪽
--   → 최근에 손댄 쪽 → id. 나머지는 merge_leads() 로 대표에 흡수된다
--   (활동·미팅·계약·세미나 참석·파트너 엔트리를 전부 옮기고, 잃는 유입채널은 메모에 남긴다).
--
-- Safe to re-run (두 번째부터는 합칠 묶음이 없어 아무 일도 하지 않는다).
-- ============================================================

-- ── 0. 사전 확인 ─────────────────────────────────────────────
-- merge_leads 가 없으면 migration-lead-stage-service-cancelled.sql 을 먼저 실행한다.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'merge_leads') then
    raise exception 'merge_leads() 가 없습니다. migration-lead-stage-service-cancelled.sql 을 먼저 실행하세요.';
  end if;
end $$;


-- ── 1. 같은 사람 키를 만드는 뷰 (미리보기·실행 양쪽에서 쓴다) ──
create or replace view public.v_lead_person_key as
with norm as (
  select l.*,
         lower(btrim(coalesce(l.email, '')))                               as e,
         case
           when regexp_replace(coalesce(l.phone,''), '\D', '', 'g') like '8210%'
             then '0' || substr(regexp_replace(coalesce(l.phone,''), '\D', '', 'g'), 3)
           when regexp_replace(coalesce(l.phone,''), '\D', '', 'g') like '82%'
            and length(regexp_replace(coalesce(l.phone,''), '\D', '', 'g')) >= 11
             then '0' || substr(regexp_replace(coalesce(l.phone,''), '\D', '', 'g'), 3)
           else regexp_replace(coalesce(l.phone,''), '\D', '', 'g')
         end                                                               as p_raw,
         lower(regexp_replace(coalesce(l.student_name,''), '\s', '', 'g')) as s,
         lower(regexp_replace(coalesce(l.parent_name,''),  '\s', '', 'g')) as pa
  from public.leads l
),
withphone as (
  -- 앞 0이 빠진 국내 휴대폰도 같은 키로. 9자리 미만은 사람을 가릴 수 없어 버린다.
  select n.*,
         case
           when length(n.p_raw) = 10 and n.p_raw like '10%' then '0' || n.p_raw
           else n.p_raw
         end as p
  from norm n
)
select w.*,
       (case when w.e <> ''                then w.e
             when length(w.p) >= 9         then w.p
             else 'p:' || w.pa end) || '|' || w.s as person_key,
       (select count(*) from public.lead_activities a where a.lead_id = w.id) as n_activities,
       (select count(*) from public.meetings        m where m.lead_id = w.id) as n_meetings,
       (select count(*) from public.contracts       c where c.lead_id = w.id) as n_contracts,
       case w.pipeline_stage::text
         when 'contracted'             then 10
         when 'service_cancelled'      then 10
         when 'contract_review'        then 9
         when 'third_consultation'     then 6
         when 'second_consultation'    then 6
         when 'first_consultation'     then 6
         when 'consultation_scheduled' then 5
         when 'on_hold'                then 4
         when 'contact_attempted'      then 3
         when 'no_response'            then 2
         else 1
       end as stage_rank
from withphone w;

comment on view public.v_lead_person_key is
  '중복 리드 판정용. person_key 가 같으면 같은 사람(형제자매는 학생 이름이 달라 분리된다).';


-- ── 2. 미리보기 — 먼저 이것만 돌려 규모를 본다 ────────────────
-- 2-a) 요약
select count(distinct person_key)                    as 중복묶음,
       count(*)                                      as 묶음에_속한_리드,
       count(*) - count(distinct person_key)         as 사라질_리드
from public.v_lead_person_key
where person_key in (
  select person_key from public.v_lead_person_key group by person_key having count(*) > 1
);

-- 2-b) 기록이 걸린 묶음만 (여기만 눈으로 확인하면 된다)
select person_key                                    as 묶음,
       student_name                                  as 학생,
       parent_name                                   as 학부모,
       pipeline_stage                                as 단계,
       n_activities                                  as 활동,
       n_meetings                                    as 상담일정,
       n_contracts                                   as 계약,
       updated_at                                    as 마지막수정,
       id                                            as 리드id
from public.v_lead_person_key
where person_key in (
  select person_key from public.v_lead_person_key
  group by person_key
  having count(*) > 1 and sum(n_activities + n_meetings + n_contracts) > 0
)
order by person_key, stage_rank desc, (n_activities + n_meetings + n_contracts) desc, updated_at desc;


-- ── 3. 실행 ─────────────────────────────────────────────────
-- 아래 블록 하나가 통째로 한 트랜잭션이다. 도중에 실패하면 아무것도 바뀌지 않는다.
do $$
declare
  v_dup   record;
  v_keep  uuid;
  v_count int := 0;
begin
  -- 대표/흡수 대상을 먼저 확정한다. 병합하면서 행이 사라지므로 계획을 떠 놓아야 한다.
  create temporary table _dup_plan on commit drop as
  select person_key,
         id,
         row_number() over (
           partition by person_key
           order by stage_rank desc,
                    (n_activities + n_meetings + n_contracts) desc,
                    updated_at desc,
                    id
         ) as rn
  from public.v_lead_person_key
  where person_key in (
    select person_key from public.v_lead_person_key group by person_key having count(*) > 1
  );

  -- 대표의 빈 칸을 같은 묶음의 다른 행에서 채운다.
  -- merge_leads 는 단계와 메모만 손대므로, 연락처·학교 같은 값은 여기서 챙긴다.
  update public.leads l
  set email          = coalesce(nullif(l.email, ''),          f.email),
      phone          = coalesce(nullif(l.phone, ''),          f.phone),
      current_school = coalesce(nullif(l.current_school, ''), f.current_school),
      grade          = coalesce(nullif(l.grade, ''),          f.grade),
      region         = coalesce(nullif(l.region, ''),         f.region),
      interest_area  = coalesce(nullif(l.interest_area, ''),  f.interest_area),
      student_name   = coalesce(nullif(l.student_name, ''),   f.student_name)
  from (
    select p.person_key,
           max(nullif(x.email, ''))          as email,
           max(nullif(x.phone, ''))          as phone,
           max(nullif(x.current_school, '')) as current_school,
           max(nullif(x.grade, ''))          as grade,
           max(nullif(x.region, ''))         as region,
           max(nullif(x.interest_area, ''))  as interest_area,
           max(nullif(x.student_name, ''))   as student_name
    from _dup_plan p
    join public.leads x on x.id = p.id
    where p.rn > 1
    group by p.person_key
  ) f
  join _dup_plan k on k.person_key = f.person_key and k.rn = 1
  where l.id = k.id;

  -- 흡수.
  for v_dup in select person_key, id from _dup_plan where rn > 1 loop
    select id into v_keep from _dup_plan where person_key = v_dup.person_key and rn = 1;
    perform public.merge_leads(v_keep, v_dup.id);
    v_count := v_count + 1;
  end loop;

  raise notice '중복 리드 % 건을 병합했습니다.', v_count;
end $$;


-- ── 4. 확인 — 0 이 나와야 한다 ───────────────────────────────
select count(*) as 남은_중복묶음
from (
  select person_key from public.v_lead_person_key group by person_key having count(*) > 1
) t;

select count(*) as 전체_리드 from public.leads;
