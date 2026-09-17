-- 리드 단계에 '서비스 취소'(계약 완료 후 서비스를 취소한 경우) 추가.
--
-- 왜 필요한가: 지금은 '이탈' 하나뿐이라 계약 전에 떠난 리드와, 계약까지 하고
-- 서비스를 취소한 고객이 같은 값으로 섞인다. 뒤쪽은 환불·정산 이력이 얽혀
-- 있어 따로 봐야 한다.
--
-- ── 1. pipeline_stage enum 에 값 추가 ────────────────────────────────
-- 칸 타입을 TEXT 로 바꾸는 방법도 있으나(contracts.status 전례), leads.pipeline_stage
-- 는 lead_activity_summary 뷰가 참조하고 있어 타입 변경이 거부된다.
--   ERROR 0A000: cannot alter type of a column used by a view or rule
-- 뷰를 지웠다 되살리면 뷰에 걸린 권한(GRANT)까지 다시 맞춰야 하고, 저장소에
-- 없는 뷰가 라이브에 더 있을 수 있어 위험하다. enum 에 값만 더하면 칸 타입이
-- 그대로라 뷰를 전혀 건드리지 않는다.
--
-- 칸이 이미 TEXT 로 바뀐 환경이면 아무 것도 하지 않는다. 여러 번 실행해도 안전하다.

DO $mig$
DECLARE
  v_type text;
BEGIN
  SELECT a.atttypid::regtype::text INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.leads'::regclass
     AND a.attname = 'pipeline_stage'
     AND NOT a.attisdropped;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'leads.pipeline_stage 칸을 찾을 수 없습니다.';
  ELSIF v_type = 'text' THEN
    RAISE NOTICE 'pipeline_stage 가 이미 TEXT 입니다 — enum 추가 불필요.';
  ELSIF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = v_type AND e.enumlabel = 'service_cancelled'
  ) THEN
    RAISE NOTICE 'service_cancelled 가 이미 있습니다 — 건너뜀.';
  ELSE
    EXECUTE format('ALTER TYPE %s ADD VALUE %L', v_type, 'service_cancelled');
    RAISE NOTICE '% 에 service_cancelled 를 추가했습니다.', v_type;
  END IF;
END
$mig$;

-- ── 2. 중복 병합 시 단계 순위에 '서비스 취소' 반영 ──────────────────
-- merge_leads 는 두 리드 중 '더 진행된' 단계를 남긴다. 순위표에 없는 값은
-- 0점이 되어, 서비스 취소 리드를 병합하면 신규 리드로 되돌아가 버린다.
-- 아래는 기존 함수와 동일하고 순위표 한 줄만 추가한 것이다.
-- (순위표의 값은 enum 이 아니라 text 로 비교하므로, 위에서 방금 추가한
--  값을 같은 트랜잭션에서 써도 문제가 없다)

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
    -- 계약 후 서비스 취소는 계약 완료와 같은 단계까지 진행된 상태다.
    -- 낮게 두면 병합 때 '신규 리드' 같은 앞 단계로 되돌아간다.
    ('service_cancelled',10),
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

NOTIFY pgrst, 'reload schema';
