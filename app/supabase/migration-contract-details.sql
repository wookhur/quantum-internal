-- Student360 계약사항 섹션: 서비스 티어 + 세부 서비스 체크리스트(별첨1 형식)를 JSON으로 저장.
-- 재실행 안전.
ALTER TABLE public.service_students
  ADD COLUMN IF NOT EXISTS contract_details jsonb;

NOTIFY pgrst, 'reload schema';
