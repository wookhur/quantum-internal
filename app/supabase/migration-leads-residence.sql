-- 콜드콜: 해외 리드의 거주국가(전화번호 국가코드 자동 인식)·거주도시(현지 시각 계산용) 저장.
-- 재실행 안전.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS residence_country text,
  ADD COLUMN IF NOT EXISTS residence_city text;

NOTIFY pgrst, 'reload schema';
