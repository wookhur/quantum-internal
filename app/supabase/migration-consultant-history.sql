-- Student360: 담당 컨설턴트 변경 이력(from→to, 변경일)을 JSON 배열로 저장.
-- 현재 담당자는 기존 assigned_consultant 컬럼을 그대로 사용(필터/집계 호환).
-- 재실행 안전.
ALTER TABLE public.service_students
  ADD COLUMN IF NOT EXISTS consultant_history jsonb;

NOTIFY pgrst, 'reload schema';
