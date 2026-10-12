-- ============================================================
-- 리드 없이 떠 있는 계약에서 리드를 만들어 연결한다
-- ------------------------------------------------------------
-- 리드를 거치지 않고 바로 계약한 고객(소개·기존 고객 재계약)은 세일즈 목록에
-- 아예 없다. 그래서 콜드콜·파이프라인·리드관리 어디에서도 안 보이고,
-- '계약 완료' 리드 수가 계약 수보다 한참 적게 나온다.
--
-- 계약서에 적힌 내용으로 리드를 만들고 계약과 묶는다.
--   학부모 = 계약자, 학생 = 계약서 학생명('한글 | English' 는 쪼개서 영문은 별칭으로)
--   연락처 = 학부모 연락처 → 없으면 대표 연락처
--   이메일 = 학부모 이메일 → 없으면 학생 이메일
--   유입채널 = '계약관리', 단계 = 계약 완료, 유입일 = 계약일
--
-- 앞으로 새로 쓰는 계약은 저장할 때 "리드를 만들까요?" 창에서 처리된다.
-- 이 SQL 은 그 창이 생기기 전에 쌓인 것만 정리한다.
--
-- Safe to re-run (두 번째부터는 만들 것이 없어 아무 일도 하지 않는다).
-- ============================================================

-- ── 1. 무엇이 만들어지는지 먼저 본다 ─────────────────────────
with src as (
  select c.id                                             as contract_id,
         btrim(c.contractor_name)                         as parent_name,
         btrim(split_part(c.student_name, '|', 1))        as student_ko,
         nullif(btrim(split_part(c.student_name, '|', 2)), '') as student_en,
         coalesce(nullif(btrim(c.parent_phone), ''), nullif(btrim(c.phone), '')) as phone,
         coalesce(nullif(btrim(lower(c.parent_email)), ''),
                  nullif(btrim(lower(c.student_email)), ''))                     as email,
         nullif(btrim(c.school_name), '')                 as school,
         nullif(btrim(c.grade_at_contract), '')           as grade,
         c.contract_date
  from public.contracts c
  where c.lead_id is null
    and btrim(coalesce(c.contractor_name, '')) <> ''
)
select contract_id as 계약id, parent_name as 학부모, student_ko as 학생,
       student_en as 영문이름, phone as 연락처, email as 이메일,
       school as 학교, grade as 학년, contract_date as 계약일
from src
order by contract_date desc;


-- ── 2. 실행 ─────────────────────────────────────────────────
-- 한 트랜잭션이다. 도중에 실패하면 아무것도 바뀌지 않는다.
do $$
declare
  r       record;
  v_lead  uuid;
  v_count int := 0;
begin
  for r in
    select c.id                                             as contract_id,
           btrim(c.contractor_name)                         as parent_name,
           btrim(split_part(c.student_name, '|', 1))        as student_ko,
           nullif(btrim(split_part(c.student_name, '|', 2)), '') as student_en,
           coalesce(nullif(btrim(c.parent_phone), ''), nullif(btrim(c.phone), '')) as phone,
           coalesce(nullif(btrim(lower(c.parent_email)), ''),
                    nullif(btrim(lower(c.student_email)), ''))                     as email,
           nullif(btrim(c.school_name), '')                 as school,
           nullif(btrim(c.grade_at_contract), '')           as grade,
           c.contract_date,
           c.address
    from public.contracts c
    where c.lead_id is null
      and btrim(coalesce(c.contractor_name, '')) <> ''
    order by c.contract_date
  loop
    insert into public.leads (
      lead_date, parent_name, student_name, name_aliases,
      phone, email, current_school, grade,
      source_channel, pipeline_stage, memo
    ) values (
      coalesce(r.contract_date, current_date),
      r.parent_name,
      coalesce(r.student_ko, ''),
      r.student_en,
      coalesce(r.phone, ''),
      r.email,
      coalesce(r.school, ''),
      coalesce(r.grade, ''),
      '계약관리',
      'contracted',
      '계약관리에 있던 계약에서 만든 리드입니다. 리드를 거치지 않고 바로 계약한 고객.'
    )
    returning id into v_lead;

    insert into public.lead_activities (lead_id, activity_type, title, content, created_by)
    values (v_lead, 'system', '리드 생성',
            r.parent_name || ' 리드가 계약관리의 계약(' || r.contract_date || ')에서 만들어졌습니다.',
            null);

    update public.contracts set lead_id = v_lead where id = r.contract_id;
    v_count := v_count + 1;
  end loop;

  raise notice '계약 % 건에서 리드를 만들어 연결했습니다.', v_count;
end $$;


-- ── 3. 확인 ─────────────────────────────────────────────────
select
  (select count(*) from public.contracts)                                 as 전체_계약,
  (select count(*) from public.contracts where lead_id is null)           as 리드_미연결,
  (select count(*) from public.leads where pipeline_stage = 'contracted') as 리드_계약완료,
  (select count(*) from public.leads)                                     as 전체_리드;
