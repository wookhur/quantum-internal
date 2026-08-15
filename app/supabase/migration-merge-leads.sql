-- ============================================================
-- 중복 리드 병합 RPC — 화면에서 두 리드를 하나로 합칠 때 호출
-- merge_leads(유지리드ID, 병합될리드ID) → 유지리드ID 반환
-- ------------------------------------------------------------
-- 동작: 병합될 리드의 자식행(활동·미팅·계약·신청서·세미나참석·파트너)을
--       유지 리드로 이관, 유니크 충돌은 정리, 파이프라인 단계는 더 진행된 값,
--       잃는 유입채널/다른표기이름은 유지 리드 메모에 보존, 병합될 리드 삭제.
--       전부 한 트랜잭션(함수) 안에서 처리 → 중간 실패 시 전체 롤백.
-- 근거: ~/Downloads/merge_exact_duplicate_leads.sql 로직을 단건 함수로 이식.
-- ============================================================

CREATE OR REPLACE FUNCTION public.merge_leads(p_survivor_id uuid, p_duplicate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup_source  text;
  v_dup_name    text;
  v_surv_name   text;
BEGIN
  IF p_survivor_id IS NULL OR p_duplicate_id IS NULL THEN
    RAISE EXCEPTION '두 리드 ID가 모두 필요합니다.';
  END IF;
  IF p_survivor_id = p_duplicate_id THEN
    RAISE EXCEPTION '같은 리드는 병합할 수 없습니다.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_survivor_id) THEN
    RAISE EXCEPTION '유지할 리드를 찾을 수 없습니다.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_duplicate_id) THEN
    RAISE EXCEPTION '병합될 리드를 찾을 수 없습니다.';
  END IF;

  -- (a) 파이프라인 단계: 둘 중 더 진행된 값으로 유지 리드를 상향
  WITH rnk(stage, r) AS (VALUES
    ('new_lead',1),('no_response',2),('paused',1),('rejected',1),('lost',1),
    ('contact_attempted',3),('on_hold',4),('consultation_scheduled',5),
    ('first_consultation',6),('second_consultation',7),('third_consultation',8),
    ('contract_review',9),('contracted',10)
  ),
  two AS (
    SELECT s.pipeline_stage AS s_stage, d.pipeline_stage AS d_stage
    FROM leads s, leads d
    WHERE s.id = p_survivor_id AND d.id = p_duplicate_id
  )
  UPDATE leads l
  SET pipeline_stage = CASE
    WHEN coalesce((SELECT r FROM rnk WHERE stage = (SELECT d_stage FROM two)::text), 0)
       > coalesce((SELECT r FROM rnk WHERE stage = (SELECT s_stage FROM two)::text), 0)
    THEN (SELECT d_stage FROM two)
    ELSE (SELECT s_stage FROM two)
  END
  WHERE l.id = p_survivor_id;

  -- (b) 잃는 유입채널/다른표기이름을 유지 리드 메모에 보존
  SELECT source_channel, student_name INTO v_dup_source, v_dup_name
  FROM leads WHERE id = p_duplicate_id;
  SELECT student_name INTO v_surv_name FROM leads WHERE id = p_survivor_id;

  UPDATE leads l
  SET memo = nullif(trim(both E'\n' from
        coalesce(l.memo,'') || E'\n' ||
        '[중복병합] 통합 유입채널: ' || coalesce(nullif(v_dup_source,''),'(없음)') ||
        CASE WHEN coalesce(v_dup_name,'') <> '' AND v_dup_name IS DISTINCT FROM v_surv_name
             THEN ' · 다른표기이름: ' || v_dup_name ELSE '' END
      ), '')
  WHERE l.id = p_survivor_id;

  -- (c) 자식행 이관 (유니크 제약 없는 테이블)
  UPDATE lead_activities  SET lead_id = p_survivor_id WHERE lead_id = p_duplicate_id;
  UPDATE meetings         SET lead_id = p_survivor_id WHERE lead_id = p_duplicate_id;
  UPDATE contracts        SET lead_id = p_survivor_id WHERE lead_id = p_duplicate_id;
  UPDATE form_submissions SET lead_id = p_survivor_id WHERE lead_id = p_duplicate_id;

  -- (d) 세미나 참석: unique(lead_id, seminar_id, session_label) 충돌분 삭제 후 이관
  DELETE FROM lead_seminar_attendance a
  WHERE a.lead_id = p_duplicate_id
    AND EXISTS (SELECT 1 FROM lead_seminar_attendance a2
                WHERE a2.lead_id = p_survivor_id
                  AND a2.seminar_id = a.seminar_id
                  AND a2.session_label = a.session_label);
  UPDATE lead_seminar_attendance SET lead_id = p_survivor_id WHERE lead_id = p_duplicate_id;

  -- (e) 파트너 엔트리: unique(program_id, lead_id) 충돌분 삭제 후 이관
  DELETE FROM partner_program_entries e
  WHERE e.lead_id = p_duplicate_id
    AND EXISTS (SELECT 1 FROM partner_program_entries e2
                WHERE e2.lead_id = p_survivor_id AND e2.program_id = e.program_id);
  UPDATE partner_program_entries SET lead_id = p_survivor_id WHERE lead_id = p_duplicate_id;

  -- (f) 병합될 리드 삭제
  DELETE FROM leads WHERE id = p_duplicate_id;

  RETURN p_survivor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_leads(uuid, uuid) TO authenticated;

-- 검증(선택): 함수 존재 확인
-- SELECT proname FROM pg_proc WHERE proname = 'merge_leads';
