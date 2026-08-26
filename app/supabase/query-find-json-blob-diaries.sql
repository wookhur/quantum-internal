-- ============================================================
-- 미팅 다이어리에 AI 요약 JSON 이 통째로 들어간(원시 JSON blob) 항목 찾기
-- ------------------------------------------------------------
-- 어떤 텍스트 필드든 "meetingSummary" 키나 ```json 코드펜스를 포함하면 대상.
-- (읽기 전용 SELECT — 데이터 변경 없음. 화면은 이미 자동 분해되어 정상 표시되지만,
--  실제 데이터까지 정리하려면 각 항목을 앱에서 '편집 → 저장' 하면 됨)
-- ============================================================

SELECT
  d.id,
  d.entry_date,
  d.author_id                                   AS 작성자,
  s.name                                        AS 학생_영문,
  s.korean_name                                 AS 학생_한글,
  left(coalesce(d.meeting_summary, ''), 60)     AS meeting_summary_미리보기
FROM public.service_diary d
LEFT JOIN public.service_students s ON s.id = d.student_id
WHERE
  (
    coalesce(d.agenda_items,'')            || coalesce(d.meeting_summary,'')       ||
    coalesce(d.extracurricular_notes,'')   || coalesce(d.identity_narrative_notes,'') ||
    coalesce(d.questions_concerns,'')      || coalesce(d.next_meeting_agenda,'')    ||
    coalesce(d.follow_up_commitments,'')   || coalesce(d.assignments,'')            ||
    coalesce(d.critical_dates,'')          || coalesce(d.critical_issue,'')
  ) LIKE '%"meetingSummary"%'
  OR coalesce(d.meeting_summary,'') LIKE '%```json%'
ORDER BY d.entry_date DESC;
