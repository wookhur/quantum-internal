-- "다음 미팅 일정"을 미팅 리포트(service_meetings)로 이동 + 옛 다이어리 값 복사.
--
-- 배경: 다음 미팅 일정은 '미팅 다이어리'(옵션)가 아니라 '미팅 리포트' 작성 시
--       입력하는 정보. KPI ⑤(다음 미팅 일정)도 리포트 기준으로 본다.
--       기존에 다이어리에 입력해 둔 값은 지우지 않고 리포트로 그대로 복사한다.
--
-- Supabase → SQL Editor 에 붙여넣고 Run (한 번만). 여러 번 실행해도 안전.

-- 1) 리포트에 다음 미팅 일정 칸 추가
alter table service_meetings
  add column if not exists next_meeting_date date;

comment on column service_meetings.next_meeting_date is
  '다음 미팅 예정일 (리포트 작성 시 입력). 관리지수 ⑤(다음 미팅 일정) 산정 기준.';

-- 2) 옛 다이어리의 다음 미팅 일정을 대응 리포트로 복사.
--    매칭: 같은 학생 + 다이어리 작성일(entry_date) = 리포트 미팅일(meeting_date).
--    (자동 다이어리는 리포트 날짜를 그대로 쓰므로 정확히 매칭됨)
--    리포트에 이미 값이 있으면 덮어쓰지 않는다.
update service_meetings m
set next_meeting_date = d.next_meeting_date
from service_diary d
where d.student_id = m.student_id
  and d.entry_date = m.meeting_date
  and d.next_meeting_date is not null
  and m.next_meeting_date is null;

-- 3) 결과 확인 (다이어리에 보유한 건수 vs 리포트로 반영된 건수)
select
  (select count(*) from service_diary    where next_meeting_date is not null) as 다이어리_보유,
  (select count(*) from service_meetings where next_meeting_date is not null) as 리포트_반영됨;
