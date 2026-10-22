-- ============================================================
-- 학부모 성함과 연락처를 각자의 칸으로
-- ------------------------------------------------------------
-- Student 360 에는 학부모 전화번호를 담을 칸이 없었다. 그래서 계약서 자동 채우기가
-- 학부모 성함 칸에 '번호 이름' 을 한 줄로 적어 왔다(`010-7165-4123 박신춘`).
-- 번호만 적힌 학생도 생겼고(`(부)010-3455-9458`), 그 탓에 계약과 학생을 이름으로
-- 맞출 수 없었다 — 52명 중 38명이 리드에 연결되지 않은 까닭이 이것이다.
--
-- 칸을 만들고, 이미 섞여 있는 값을 쪼갠다. 번호는 parent_phone 으로 옮기고
-- 이름만 parent_name 에 남긴다. 이름이 통째로 없던 건은 연결된 계약의 계약자명으로
-- 채운다. 이미 parent_phone 이 적혀 있으면 덮지 않는다.
--
-- 앞으로는 계약 입력 네 곳(계약 추가 · 리드에서 계약 생성 · 계약 수정 · 계약서 PDF)이
-- 학생 이름·영문명·연락처·이메일과 학부모 성명·연락처·이메일을 각각 따로 받는다.
-- Safe to re-run (두 번째부터는 쪼갤 값이 없어 아무 일도 하지 않는다).
-- ============================================================

-- ── 1. 칸 만들기 ─────────────────────────────────────────────
alter table public.service_students add column if not exists parent_phone text;

comment on column public.service_students.parent_name  is '학부모 성함. 이름만 — 번호는 parent_phone 으로.';
comment on column public.service_students.parent_phone is '학부모 연락처.';


-- ── 2. 미리보기 — 무엇이 어떻게 쪼개지는지 ───────────────────
with s as (
  select s.id, s.name, s.korean_name, s.parent_name, s.parent_phone, s.lead_id,
         (regexp_match(coalesce(s.parent_name, ''), '\+?[0-9][0-9 ().-]{6,}[0-9]'))[1] as tel,
         btrim(regexp_replace(coalesce(s.parent_name, ''),
                              '\+?[0-9][0-9 ().-]{6,}[0-9]', '', 'g'),
               ' |,/·()（）') as rest
  from public.service_students s
),
plan as (
  select s.*,
         -- 번호를 떼고 '모'·'부' 같은 관계 표시만 남으면 이름이 없는 것으로 본다
         case when s.rest in ('모','부','모친','부친','어머니','아버지','학부모') then '' else s.rest end as cut_name,
         ct.contractor_name
  from s
  left join lateral (
    select ct.contractor_name
    from public.contracts ct
    where ct.lead_id = s.lead_id and s.lead_id is not null
    order by case when ct.status = 'cancelled' then 1 else 0 end, ct.contract_date desc
    limit 1
  ) ct on true
  where s.tel is not null
    and length(regexp_replace(s.tel, '\D', '', 'g')) >= 8
)
select coalesce(nullif(korean_name, ''), name)                         as 학생,
       parent_name                                                     as 지금_학부모칸,
       coalesce(nullif(cut_name, ''), nullif(btrim(contractor_name), '')) as 바뀔_성함,
       coalesce(nullif(btrim(parent_phone), ''), tel)                   as 바뀔_연락처,
       case when nullif(cut_name, '') is null and nullif(btrim(contractor_name), '') is not null
              then '계약자명에서 가져옴'
            when nullif(cut_name, '') is null
              then '성함 없음 — 계약도 없어 비워 둡니다'
            else '번호만 분리' end                                       as 처리
from plan
order by 처리, 학생;


-- ── 3. 실행 ─────────────────────────────────────────────────
with s as (
  select s.id, s.parent_name, s.parent_phone, s.lead_id,
         (regexp_match(coalesce(s.parent_name, ''), '\+?[0-9][0-9 ().-]{6,}[0-9]'))[1] as tel,
         btrim(regexp_replace(coalesce(s.parent_name, ''),
                              '\+?[0-9][0-9 ().-]{6,}[0-9]', '', 'g'),
               ' |,/·()（）') as rest
  from public.service_students s
),
plan as (
  select s.id, s.parent_phone, s.tel,
         case when s.rest in ('모','부','모친','부친','어머니','아버지','학부모') then '' else s.rest end as cut_name,
         ct.contractor_name
  from s
  left join lateral (
    select ct.contractor_name
    from public.contracts ct
    where ct.lead_id = s.lead_id and s.lead_id is not null
    order by case when ct.status = 'cancelled' then 1 else 0 end, ct.contract_date desc
    limit 1
  ) ct on true
  where s.tel is not null
    and length(regexp_replace(s.tel, '\D', '', 'g')) >= 8
)
update public.service_students t
set parent_name  = coalesce(nullif(p.cut_name, ''), nullif(btrim(p.contractor_name), '')),
    -- 이미 적혀 있는 학부모 연락처는 덮지 않는다
    parent_phone = coalesce(nullif(btrim(p.parent_phone), ''), p.tel),
    updated_at   = now()
from plan p
where t.id = p.id;


-- ── 4. 확인 — 성함 칸에 번호가 남은 학생이 0 이어야 한다 ─────
select count(*) as 번호가_남은_성함칸
from public.service_students
where coalesce(parent_name, '') ~ '[0-9]{3}';

select coalesce(nullif(korean_name, ''), name) as 학생,
       parent_name  as 학부모성함,
       parent_phone as 학부모연락처
from public.service_students
order by 1;

notify pgrst, 'reload schema';
