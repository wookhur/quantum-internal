-- 세미나 성과표에서 '전화상담'과 '계약'이 0으로만 나오는 원인 확인
--
-- 두 칼럼은 서로 다른 데이터를 본다.
--   · 전화상담 = meetings.meeting_method 가 정확히 'phone' 인 건수
--                (Zoom='zoom', 대면='in_person')
--   · 계약     = 그 세미나로 매칭된 leads.pipeline_stage 가 정확히 'contracted' 인 리드 수
--                (계약관리(contracts) 테이블이 아니라 '리드의 파이프라인 단계'를 본다)
--
-- Supabase SQL Editor 에 붙여 실행. 읽기만 하며 데이터를 바꾸지 않는다.

-- 1) 미팅 방식 값 분포 — 'phone' 이 실제로 쓰이는지, 다른 표기/빈값인지
select coalesce(meeting_method, '(비어 있음)') as 미팅방식,
       count(*) as 건수,
       min(meeting_date) as 처음, max(meeting_date) as 마지막
  from meetings
 group by 1
 order by 건수 desc;

-- 2) 리드 파이프라인 단계 분포 — 'contracted' 단계에 리드가 실제로 있는지
select coalesce(pipeline_stage, '(비어 있음)') as 단계,
       count(*) as 리드수
  from leads
 group by 1
 order by 리드수 desc;

-- 3) 계약관리에는 계약이 있는데 리드 단계는 '계약 완료'가 아닌 사람
--    (→ 성과표 '계약'이 0으로 나오는 전형적인 원인. 이름 기준 대략 매칭)
with l as (
  select id, pipeline_stage,
         replace(lower(coalesce(student_name,'')), ' ', '') as sn,
         replace(lower(coalesce(parent_name ,'')), ' ', '') as pn,
         source_channel, created_at
    from leads
),
c as (
  select replace(lower(coalesce(student_name,'')), ' ', '') as cn, student_name, contract_date, status
    from contracts
   where coalesce(status,'') <> 'cancelled'
)
select c.student_name as 계약학생명,
       c.contract_date as 계약일,
       l.pipeline_stage as 리드단계,
       l.source_channel as 유입경로
  from c
  join l on l.sn <> '' and c.cn like '%' || l.sn || '%'
 where coalesce(l.pipeline_stage,'') <> 'contracted'
 order by c.contract_date desc nulls last;
