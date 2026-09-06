-- "다음 미팅 일정"을 미팅 리포트(service_meetings)에 기록하도록 이동.
--
-- 배경: 다음 미팅 일정은 '미팅 다이어리'(옵션)가 아니라 '미팅 리포트' 작성 시
--       입력하는 정보가 맞다. KPI ⑤(다음 미팅 일정)도 리포트 기준으로 본다.
--       (기존 service_diary.next_meeting_date 는 그대로 두되 더 이상 쓰지 않음)
--
-- Supabase → SQL Editor 에 붙여넣고 Run (한 번만).

alter table service_meetings
  add column if not exists next_meeting_date date;

comment on column service_meetings.next_meeting_date is
  '다음 미팅 예정일 (리포트 작성 시 입력). 관리지수 ⑤(다음 미팅 일정) 산정 기준.';

-- 확인용
select column_name, data_type
from information_schema.columns
where table_name = 'service_meetings'
  and column_name = 'next_meeting_date';
