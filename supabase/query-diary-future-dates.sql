-- Student360 미팅다이어리·미팅 중 '미래 날짜'로 저장된 항목 찾기 / 바로잡기
--
-- 왜 필요한가: 다이어리는 최신 날짜순(entry_date 내림차순)으로 보인다. 연도를 잘못 넣으면
-- (예: 2026-07-21 → 2028-07-21) 그 항목이 늘 맨 위에 고정돼 정렬이 깨져 보인다.
-- 다이어리 일자는 미팅 일자를 따르므로, 실제로 열린 미팅(status='held')의 미래 날짜도 함께 본다.
--
-- 바로잡는 규칙: 월·일은 그대로 두고, 연도만 '그 행을 만든 날(created_at, 한국시간)'과
-- 가장 가까운 해로 바꾼다(만든 해의 전년·당해·다음해 중, 오늘을 넘지 않는 것).
--   예) 2028-07-21, 2026-07-22 기록 → 2026-07-21
--   예) 2027-12-30, 2026-01-03 기록 → 2025-12-30 (1월에 지난 12월 미팅을 기록)
--   예) 2028-07-21, 2026-07-20 미리 등록한 미팅 → 2026-07-21
-- 후보가 하나도 없으면(고칠 날짜가 비어 있으면) 자동으로 고치지 않으니 화면에서 직접 고친다.
--
-- Supabase SQL Editor 에서 [1] 미리보기로 '고칠 날짜'를 확인한 뒤 [2]를 실행한다.

-- [1] 미리보기 (읽기만 함)
with d as (
  select 'diary' as kind, sd.id, s.name as student, sd.entry_date as wrong_date,
         (sd.created_at at time zone 'Asia/Seoul')::date as created_kst
    from service_diary sd join service_students s on s.id = sd.student_id
   where sd.entry_date > (now() at time zone 'Asia/Seoul')::date
  union all
  select 'meeting', sm.id, s.name, sm.meeting_date,
         (sm.created_at at time zone 'Asia/Seoul')::date
    from service_meetings sm join service_students s on s.id = sm.student_id
   where sm.status = 'held' and sm.meeting_date > (now() at time zone 'Asia/Seoul')::date
)
select d.kind, d.student, d.wrong_date as 지금_날짜, fix.new_date as 고칠_날짜,
       d.created_kst as 기록한_날, d.id
  from d
  left join lateral (
    select c::date as new_date
      from (select (d.wrong_date - make_interval(years =>
                     extract(year from d.wrong_date)::int - extract(year from d.created_kst)::int - k)) as c
              from unnest(array[-1, 0, 1]) as k) cand
     where c::date <= (now() at time zone 'Asia/Seoul')::date
     order by abs(c::date - d.created_kst)
     limit 1
  ) fix on true
 order by d.student, d.kind, d.wrong_date;

-- [2] 바로잡기 (미리보기 결과가 맞을 때만 실행)
begin;

update service_diary sd
   set entry_date = fix.new_date
  from service_diary src
  cross join lateral (
    select c::date as new_date
      from (select (src.entry_date - make_interval(years =>
                     extract(year from src.entry_date)::int
                     - extract(year from (src.created_at at time zone 'Asia/Seoul'))::int - k)) as c
              from unnest(array[-1, 0, 1]) as k) cand
     where c::date <= (now() at time zone 'Asia/Seoul')::date
     order by abs(c::date - (src.created_at at time zone 'Asia/Seoul')::date)
     limit 1
  ) fix
 where sd.id = src.id
   and src.entry_date > (now() at time zone 'Asia/Seoul')::date;

update service_meetings sm
   set meeting_date = fix.new_date
  from service_meetings src
  cross join lateral (
    select c::date as new_date
      from (select (src.meeting_date - make_interval(years =>
                     extract(year from src.meeting_date)::int
                     - extract(year from (src.created_at at time zone 'Asia/Seoul'))::int - k)) as c
              from unnest(array[-1, 0, 1]) as k) cand
     where c::date <= (now() at time zone 'Asia/Seoul')::date
     order by abs(c::date - (src.created_at at time zone 'Asia/Seoul')::date)
     limit 1
  ) fix
 where sm.id = src.id
   and src.status = 'held'
   and src.meeting_date > (now() at time zone 'Asia/Seoul')::date;

commit;
