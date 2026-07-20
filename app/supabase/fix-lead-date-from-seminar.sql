-- 유입일 보정: source_channel 이 세미나 제목과 일치하는 리드의 lead_date 를
-- 그 세미나의 진행일로 되돌린다. (CSV/시트 유입 시 오늘 날짜로 찍혀버린 문제 수정)
-- 타입 주의: leads.lead_date = date, seminars.date = text → s.date 쪽을 ::date 로 캐스팅.
--   정규식 가드(^\d{4}-\d{2}-\d{2}$)로 형식이 올바른 세미나만 대상 → 캐스팅 오류 방지.
-- 안전장치: lead_date 가 세미나 진행일보다 '늦은' 경우에만 앞당긴다(과거로만 이동).
-- source_channel 은 건드리지 않는다. 실행 전 반드시 STEP 1/2 로 미리보기.

-- ── STEP 1. 세미나 진행일 확인 ──
SELECT id, title, date FROM public.seminars
WHERE title = '260627 선배 초청 세미나'
ORDER BY date;

-- ── STEP 2. 바뀔 리드 미리보기 (조회만) ──
SELECT l.id, l.student_name, l.parent_name, l.source_channel,
       l.lead_date AS 현재_유입일, s.date AS 변경후_유입일
FROM public.leads l
JOIN public.seminars s ON s.title = l.source_channel
WHERE s.date ~ '^\d{4}-\d{2}-\d{2}$'
  AND l.lead_date > s.date::date
ORDER BY l.source_channel, l.lead_date;

-- ── STEP 3. 실행 (유입일을 세미나 진행일로 보정) ──
UPDATE public.leads l
SET lead_date = s.date::date
FROM public.seminars s
WHERE l.source_channel = s.title
  AND s.date ~ '^\d{4}-\d{2}-\d{2}$'
  AND l.lead_date > s.date::date;
