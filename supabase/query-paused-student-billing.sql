-- 휴면(paused) 학생의 관리비 청구 판정 확인
--
-- 왜 필요한가: 개인 파트너 인보이스의 '청구 가능 학생'은 아래 두 조건을 모두 만족해야
-- 목록에 오른다. 휴면 학생이 안 보이는 이유가 ①인지 ②인지 구분하려고 만든 쿼리다.
--   ① 학생이 활성 상태이고 휴면(paused)이 아님          ← 앱: isActiveStudent(status) && !s.paused
--   ② 리포트 완료(또는 노쇼) 미팅을 2개씩 짝지었을 때,
--      그 짝의 '2번째 미팅'이 정산월에 있음              ← 앱: pairsClosingInMonth()
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.
-- 정산월을 바꾸려면 아래 '2026-09' 를 고치면 된다.

-- 1) 특정 학생의 상태와 미팅 이력 (이름은 필요에 따라 바꿔서 사용)
with target as (
  select id, name, korean_name, status, paused, pause_reason, pause_return_date,
         assigned_consultant, start_date
    from service_students
   where korean_name like '%현시우%' or name ilike '%hyun%si%'
),
mt as (
  select m.student_id,
         m.meeting_date,
         m.status,
         m.report_status,
         (m.report_url is not null) as has_report,
         -- 앱과 같은 판정: 노쇼이거나 리포트 제출/URL 있음 + 취소 아님
         (   (m.status = 'no_show' or m.report_status = 'submitted' or m.report_url is not null)
         and coalesce(m.status,'') <> 'cancelled'
         and m.meeting_date is not null) as counts
    from service_meetings m
   where m.student_id in (select id from target)
),
numbered as (
  select *, row_number() over (order by meeting_date) as rn
    from mt
   where counts
)
select t.korean_name as 학생,
       t.status      as 상태,
       t.paused      as 휴면여부,
       t.pause_reason as 휴면사유,
       t.pause_return_date as 복귀예정일,
       n.meeting_date as 미팅일,
       n.status       as 미팅상태,
       n.report_status as 리포트,
       case when n.rn % 2 = 0
            then '짝 마감 → ' || to_char(n.meeting_date, 'YYYY-MM') || ' 관리비 1개월치'
            else '짝 대기(다음 미팅과 짝지어짐)'
       end as 청구판정
  from target t
  left join numbered n on n.student_id = t.id
 order by n.meeting_date;

-- 2) 정산월에 '짝이 마감됐는데' 휴면이라 청구 목록에서 빠진 학생 전체
--    (= 휴면만 아니었으면 청구됐을 학생 → 이번 건과 같은 상황인 사람이 또 있는지)
with counted as (
  select m.student_id, m.meeting_date,
         row_number() over (partition by m.student_id order by m.meeting_date) as rn
    from service_meetings m
   where (m.status = 'no_show' or m.report_status = 'submitted' or m.report_url is not null)
     and coalesce(m.status,'') <> 'cancelled'
     and m.meeting_date is not null
),
pairs as (   -- 짝수 번째 미팅이 짝을 마감한다
  select student_id, to_char(meeting_date, 'YYYY-MM') as 마감월, meeting_date
    from counted where rn % 2 = 0
)
select s.korean_name as 학생,
       coalesce(p2.name, s.assigned_consultant) as 담당컨설턴트,
       s.status as 상태,
       s.paused as 휴면여부,
       s.pause_reason as 휴면사유,
       pr.meeting_date as 짝마감미팅일
  from pairs pr
  join service_students s on s.id = pr.student_id
  left join profiles p2 on p2.id::text = s.assigned_consultant
 where pr.마감월 = '2026-09'
   and s.paused = true
 order by s.korean_name;
