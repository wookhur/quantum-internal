-- ============================================================
-- 김채현(Chloe Kim) 학생이 Isabela 선생님 10월 인보이스에 안 잡히는 이유 찾기
-- ------------------------------------------------------------
-- Student 360 에는 '담당 컨설턴트 = Isabela' 로 보이는데
-- 개인 파트너(재무) 2026-10 의 Isabela 자동청구 목록에는 안 올라온 건.
--
-- 인보이스는 '지금 담당자(assigned_consultant)' 가 아니라
-- '그 미팅 날짜에 담당이던 사람(consultant_history 로 역산)' 으로 금액을 모읍니다.
-- 그래서 ①의 마지막 이력이 Isabela 가 아니면, 화면에는 Isabela 로 보여도
-- 미팅은 그 이력에 적힌 사람 쪽으로 쌓입니다.
--
-- 아래 ①~⑤ 를 차례로 실행하고 결과를 알려 주세요.
-- ============================================================

-- ① 학생 상태 + 지금 담당자 + 이력의 마지막 담당자 (여기서 이미 답이 나올 수 있습니다)
select
  s.id,
  s.korean_name,
  s.name,
  s.status,
  s.paused,
  s.pause_return_date,
  s.assigned_consultant                                   as 지금담당자_저장값,
  p.name                                                  as 지금담당자_프로필이름,
  jsonb_array_length(coalesce(s.consultant_history,'[]'::jsonb)) as 이력건수,
  (
    select e.elem->>'to'
    from jsonb_array_elements(coalesce(s.consultant_history,'[]'::jsonb)) as e(elem)
    order by e.elem->>'date' desc
    limit 1
  )                                                       as 이력_마지막_넘겨받은사람,
  s.consultant_history                                    as 이력전체
from public.service_students s
left join public.profiles p on p.id::text = s.assigned_consultant
where s.korean_name like '%김채현%'
   or s.name ilike '%chloe%';

-- ② 이력을 날짜순으로 펼쳐 보기 (누가 언제 누구에게 넘겼는지, 이름까지 해석)
select
  s.korean_name,
  e.ord                                as 순서,
  e.elem->>'date'                      as 넘긴날,
  e.elem->>'from'                      as 넘긴사람_저장값,
  pf.name                              as 넘긴사람_이름,
  e.elem->>'to'                        as 받은사람_저장값,
  pt.name                              as 받은사람_이름
from public.service_students s
cross join lateral jsonb_array_elements(coalesce(s.consultant_history,'[]'::jsonb))
                   with ordinality as e(elem, ord)
left join public.profiles pf on pf.id::text = e.elem->>'from'
left join public.profiles pt on pt.id::text = e.elem->>'to'
where s.korean_name like '%김채현%'
   or s.name ilike '%chloe%'
order by e.elem->>'date';

-- ③ 이 학생의 2026-08 이후 미팅 — 인보이스에 세어지는 미팅인지
--    (취소 아님 + 리포트 제출 또는 리포트 링크 있음 또는 노쇼)
select
  m.meeting_date,
  m.status,
  m.report_status,
  (m.report_url is not null)                  as 리포트링크있음,
  (    m.status <> 'cancelled'
   and (m.status in ('no_show','noshow') or m.report_status = 'submitted' or m.report_url is not null)
  )                                           as 인보이스에_세어짐
from public.service_meetings m
join public.service_students s on s.id = m.student_id
where (s.korean_name like '%김채현%' or s.name ilike '%chloe%')
  and m.meeting_date >= '2026-08-01'
order by m.meeting_date;

-- ④ Isabela 와 남연서가 프로필·연 관리비에 각각 어떻게 들어가 있는지
--    (연 관리비가 있으면 '회당 정산', 없으면 '미팅 2회 = 1개월분' 방식)
select id, name, role, is_external
from public.profiles
where name ilike '%isabela%' or name ilike '%ivitta%' or name like '%남연서%' or name ilike '%evelyn%'
order by name;

select name_key, display_name, annual_amount, sessions
from public.consultant_annual_fees
order by display_name;

-- ⑤ 이미 발행·지급완료된 10월 인보이스가 그 줄을 덮어 숨긴 건 아닌지
select
  i.id,
  coalesce(i.client_name, p.name) as 수령인,
  i.kind,
  i.invoice_month,
  i.status,
  i.paid_date,
  i.total_amount
from public.freelancer_invoices i
left join public.profiles p on p.id = i.freelancer_id
where i.invoice_month in ('2026-09','2026-10')
  and (p.name ilike '%isabela%' or i.client_name ilike '%isabela%'
       or p.name like '%남연서%' or i.client_name like '%남연서%')
order by 수령인, i.invoice_month;
