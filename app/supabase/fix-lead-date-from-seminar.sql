-- 유입일 보정: source_channel 이 세미나 제목과 일치하는 리드의 lead_date 를
-- 그 세미나의 진행일로 되돌린다. (CSV/시트 유입 시 오늘 날짜로 찍혀버린 문제 수정)
-- 안전장치: lead_date 가 세미나 진행일보다 '늦은' 경우에만 앞당긴다(과거로만 이동).
-- source_channel 은 건드리지 않는다. 실행 전 반드시 STEP 1/2 로 미리보기.

-- ── STEP 1. 세미나 진행일이 채워져 있는지 확인 ──
--   date 가 NULL 이면 STEP 3 대신 STEP 4(리터럴 날짜)를 쓴다.
SELECT id, title, date FROM public.seminars
WHERE title IN ('260627 선배 초청 세미나')  -- 필요한 세미나 제목 추가
ORDER BY date;

-- ── STEP 2. 바뀔 리드 미리보기 ──
SELECT l.id, l.student_name, l.parent_name, l.source_channel,
       l.lead_date AS 현재_유입일, s.date AS 변경후_유입일
FROM public.leads l
JOIN public.seminars s ON s.title = l.source_channel
WHERE s.date IS NOT NULL
  AND l.lead_date > s.date
ORDER BY l.source_channel, l.lead_date;

-- ── STEP 3. 실행 (세미나 진행일이 채워진 경우) ──
-- UPDATE public.leads l
-- SET lead_date = s.date
-- FROM public.seminars s
-- WHERE l.source_channel = s.title
--   AND s.date IS NOT NULL
--   AND l.lead_date > s.date;

-- ── STEP 4. 대안: 특정 세미나만 리터럴 날짜로 (진행일 미기입 시) ──
-- UPDATE public.leads
-- SET lead_date = '2026-06-27'
-- WHERE source_channel = '260627 선배 초청 세미나'
--   AND lead_date > '2026-06-27';
