-- 리드 별칭(다른 표기·형제 이름) 보존용 컬럼.
-- 이메일 기준으로 중복 리드를 1개로 병합할 때, 대표 이름 외의 표기
-- (영어 이름/한글 이름/형제 이름 등)를 여기에 모아 보존한다.
-- 콜드콜·리드관리 검색 대상에 포함되어 어떤 이름으로도 찾을 수 있다. Safe to re-run.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS name_aliases TEXT;

NOTIFY pgrst, 'reload schema';
