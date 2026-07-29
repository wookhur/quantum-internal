-- 프로그램(파트너)으로 유입된 리드 중 담당자(assigned_to)가 미지정인 건을,
-- 해당 리드의 '가장 이른 활동(=리드 생성) 작성자'로 자동 지정.
--
-- 대상: partner_program_entries에 연결된 리드 && assigned_to IS NULL
-- 값:   그 리드의 lead_activities 중 가장 오래된 기록의 created_by (보통 '리드 생성' 작성자)
-- 안전: 이미 담당자가 있는 리드는 건드리지 않음.

update public.leads l
set assigned_to = sub.created_by
from (
  select distinct on (la.lead_id) la.lead_id, la.created_by
  from public.lead_activities la
  where la.created_by is not null
  order by la.lead_id, la.created_at asc
) sub
where l.id = sub.lead_id
  and l.assigned_to is null
  and exists (
    select 1 from public.partner_program_entries e where e.lead_id = l.id
  );

-- 확인용(선택): 아직 담당자 없는 프로그램 리드 수
-- select count(*) from public.leads l
-- where l.assigned_to is null
--   and exists (select 1 from public.partner_program_entries e where e.lead_id = l.id);
