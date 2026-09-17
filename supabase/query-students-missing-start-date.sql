-- Student360 활성 학생 중 '시작일'(start_date)이 비어 있는 학생 찾기
--
-- 왜 필요한가: 계약연차는 시작일부터 12개월 단위로 계산한다. 시작일이 비어
-- 있으면 contractYearOf 가 항상 1년차를 돌려주므로, 1년이 지나도 2년차로
-- 넘어가지 않고 미팅 수가 계속 누적된다(+30, +40 …).
-- 11월에 2년차 학생이 생기기 전에 채워 두어야 한다.
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.
-- 상태 판정은 앱의 '활성'(normalizeStatus) 기준과 같게 맞췄다.
-- Student360 활성 학생 중 '시작일'이 비어 있는 학생
-- 시작일이 없으면 계약연차가 항상 1년차로 고정돼, 2년차로 넘어가지 않고
-- 미팅 수가 계속 누적된다(+30, +40 …). 11월 연차 전환 전에 채워야 한다.
with s as (
  select id, name, korean_name, assigned_consultant, start_date,
         lower(btrim(coalesce(status,''))) as st
    from service_students
),
active_s as (   -- 앱의 '활성' 기준과 동일 (완료·취소 계열 제외)
  select * from s
   where st not in ('finished','done','completed','complete','완료','서비스 완료','종료',
                    'canceled','cancelled','취소','서비스 취소','해지')
),
m as (
  select student_id,
         count(*) filter (where status = 'held') as held,
         min(coalesce(meeting_date, created_at::date)) filter (where status = 'held') as first_held,
         max(coalesce(meeting_date, created_at::date)) filter (where status = 'held') as last_held
    from service_meetings
   group by student_id
)
select a.korean_name as 한글명,
       a.name        as 영문명,
       coalesce(p.name, a.assigned_consultant) as 담당컨설턴트,
       coalesce(m.held, 0)  as 완료미팅,
       m.first_held         as 첫미팅일,
       m.last_held          as 마지막미팅일,
       case
         when coalesce(m.held,0) > 24 then '⚠ 이미 24회 초과 — 연차 구분이 안 되고 있음'
         when m.first_held is not null then '첫 미팅일을 시작일로 넣으면 됨'
         else '미팅 기록이 없어 시작일을 따로 확인해야 함'
       end as 조치
  from active_s a
  left join m on m.student_id = a.id
  left join profiles p on p.id::text = a.assigned_consultant
 where a.start_date is null
 order by coalesce(m.held,0) desc, a.korean_name, a.name;
