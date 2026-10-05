-- ============================================================
-- 박태현 학생이 9월 관리비(프리랜서 인보이스)에 안 잡히는 이유 찾기
-- ------------------------------------------------------------
-- 아래 네 개를 차례로 실행하고 결과를 알려 주세요.
-- 관리비는 '리포트 완료(또는 노쇼) 미팅을 시간순 2개씩 짝지어,
--  짝의 두 번째 미팅이 있는 달'에 1개월치가 잡힙니다.
-- ============================================================

-- ① 학생 상태: 활성인지, 휴면인지, 담당 컨설턴트가 누구로 저장돼 있는지
select
  s.id,
  s.korean_name,
  s.name,
  s.status,
  s.paused,
  s.pause_return_date,
  s.assigned_consultant                      as 담당컨설턴트_저장값,
  p.name                                     as 담당컨설턴트_프로필이름,
  p.role                                     as 담당컨설턴트_역할
from public.service_students s
left join public.profiles p
       on p.id::text = s.assigned_consultant
where s.korean_name like '%박태현%'
   or s.name ilike '%taehyun%';

-- ② 그 학생의 미팅 전체 — 관리비에 세어지는 미팅인지(리포트 제출 또는 노쇼, 취소 아님)
select
  m.meeting_date,
  m.status,
  m.report_status,
  (m.report_url is not null)                 as 리포트링크있음,
  (    m.status <> 'cancelled'
   and (m.status in ('no_show','noshow') or m.report_status = 'submitted' or m.report_url is not null)
  )                                          as 관리비에_세어짐
from public.service_meetings m
join public.service_students s on s.id = m.student_id
where (s.korean_name like '%박태현%' or s.name ilike '%taehyun%')
order by m.meeting_date;

-- ③ 'Aidan Lee' 와 '이준형' 이 각각 프로필에 어떻게 들어가 있는지
--    (이름이 다르면 관리비는 'Aidan Lee' 쪽에 쌓이고 '이준형' 인보이스에는 안 보입니다)
select id, name, role, is_external
from public.profiles
where name ilike '%aidan%'
   or name like '%이준형%'
   or name ilike '%lee%'
order by name;

-- ④ 9월 인보이스가 어떤 이름으로 발행돼 있는지
select id, freelancer_name, month, status, created_at
from public.freelancer_invoices
where month = '2026-09'
order by freelancer_name;
