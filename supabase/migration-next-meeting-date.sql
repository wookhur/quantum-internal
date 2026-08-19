-- ─────────────────────────────────────────────────────────────
-- 미팅 다이어리에 "다음 미팅 일정" 날짜 칸 추가
--
-- 배경: 관리지수(KPI) ⑤번 항목이 "후속과제 처리율"(체크박스를 켰는가)이라
--       스위치 클릭만으로 점수가 오르고, AI 자동생성 항목의 정확도에 따라
--       점수가 흔들렸다. 이를 "미팅 후 다음 일정을 잡았는가"라는
--       객관적으로 확인 가능한 기록으로 대체한다.
--
-- Supabase → SQL Editor 에 붙여넣고 Run (한 번만 실행하면 된다)
-- ─────────────────────────────────────────────────────────────

alter table service_diary
  add column if not exists next_meeting_date date;

comment on column service_diary.next_meeting_date is
  '다음 미팅 예정일. 관리지수 ⑤(다음 미팅 일정) 산정 기준.';

-- 확인용: 칸이 잘 추가됐는지
select column_name, data_type
from information_schema.columns
where table_name = 'service_diary'
  and column_name = 'next_meeting_date';
