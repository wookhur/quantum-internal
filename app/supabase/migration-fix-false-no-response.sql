-- 콜드콜: '부재중(no_response)' 뱃지가 잘못 남은 리드 교정.
-- 원인: 1:1 상담유도 성공 토글(metadata.oneOnOneConsult)이 파이프라인 단계를 올려주지 않아,
--       이전 무응답으로 no_response가 된 뒤 실제 접촉/상담유도가 되어도 '부재중'에 머물렀음.
-- 대상: pipeline_stage = 'no_response' 이면서
--   (1) 어느 활동이든 1:1 상담유도 성공이 기록됨(oneOnOneConsult=true), 또는
--   (2) 가장 최근 접촉 활동의 결과가 긍정(통화연결/응답/읽음) 또는 상담(consultation)인 경우
-- 조치: '컨택 완료(contact_attempted)'로 되돌림 (실제 예약이 아니므로 상담예약까지 올리지 않음).

-- ── 1) 먼저 영향 대상 미리보기 (실행 후 결과 확인) ──
WITH last_contact AS (
  SELECT DISTINCT ON (a.lead_id) a.lead_id, a.metadata, a.activity_type
  FROM lead_activities a
  WHERE a.activity_type IN ('call','sms','katalk','email','consultation')
  ORDER BY a.lead_id, a.created_at DESC
)
SELECT l.id, l.parent_name, l.student_name,
       lc.activity_type AS last_type,
       lc.metadata->>'callResult' AS last_result,
       (EXISTS (SELECT 1 FROM lead_activities a2
                WHERE a2.lead_id = l.id AND (a2.metadata->>'oneOnOneConsult') = 'true')) AS has_one_on_one
FROM leads l
JOIN last_contact lc ON lc.lead_id = l.id
WHERE l.pipeline_stage = 'no_response'
  AND (
    (lc.metadata->>'callResult') IN ('connected','replied','read')
    OR lc.activity_type = 'consultation'
    OR EXISTS (SELECT 1 FROM lead_activities a2
               WHERE a2.lead_id = l.id AND (a2.metadata->>'oneOnOneConsult') = 'true')
  )
ORDER BY l.parent_name;

-- ── 2) 확인 후 실제 교정 (위 미리보기와 동일 조건) ──
WITH last_contact AS (
  SELECT DISTINCT ON (a.lead_id) a.lead_id, a.metadata, a.activity_type
  FROM lead_activities a
  WHERE a.activity_type IN ('call','sms','katalk','email','consultation')
  ORDER BY a.lead_id, a.created_at DESC
)
UPDATE leads l
SET pipeline_stage = 'contact_attempted', updated_at = now()
FROM last_contact lc
WHERE lc.lead_id = l.id
  AND l.pipeline_stage = 'no_response'
  AND (
    (lc.metadata->>'callResult') IN ('connected','replied','read')
    OR lc.activity_type = 'consultation'
    OR EXISTS (SELECT 1 FROM lead_activities a2
               WHERE a2.lead_id = l.id AND (a2.metadata->>'oneOnOneConsult') = 'true')
  )
RETURNING l.id, l.parent_name, l.student_name;
