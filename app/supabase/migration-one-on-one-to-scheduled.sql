-- 콜드콜: 1:1 상담유도 성공 이력이 있는 리드를 '상담예약(consultation_scheduled)' 단계로.
-- 목적: 상담예약 필터에 잡히고, 화면에서 '1:1 상담' 뱃지가 뜨도록 통일.
-- 대상: 어느 활동이든 metadata.oneOnOneConsult=true 이고, 아직 콜드콜 단계
--       (신규리드/컨택완료/부재중/콜백요청) 에 머물러 있는 리드.
--       이미 상담예약 이후로 진행된 리드는 건드리지 않음.

-- ── 미리보기 ──
SELECT l.id, l.parent_name, l.student_name, l.pipeline_stage
FROM leads l
WHERE l.pipeline_stage IN ('new_lead','contact_attempted','no_response','on_hold')
  AND EXISTS (
    SELECT 1 FROM lead_activities a
    WHERE a.lead_id = l.id AND (a.metadata->>'oneOnOneConsult') = 'true'
  )
ORDER BY l.parent_name;

-- ── 교정 ──
UPDATE leads l
SET pipeline_stage = 'consultation_scheduled', updated_at = now()
WHERE l.pipeline_stage IN ('new_lead','contact_attempted','no_response','on_hold')
  AND EXISTS (
    SELECT 1 FROM lead_activities a
    WHERE a.lead_id = l.id AND (a.metadata->>'oneOnOneConsult') = 'true'
  )
RETURNING l.id, l.parent_name, l.student_name;
