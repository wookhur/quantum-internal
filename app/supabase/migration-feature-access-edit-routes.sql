-- 게시판별 뷰어/편집 권한: feature_access.edit_routes 에 '편집 가능' 라우트 목록을 저장.
--   enabled_routes(열람 가능) 중 edit_routes 에 포함된 라우트만 수정 가능, 나머지는 뷰어(읽기전용).
--   edit_routes 가 NULL 이면 레거시로 간주 → 열람 가능한 모든 게시판을 편집 허용(기존 동작 유지).
-- edit_routes 는 enabled_routes 와 동일한 text[] 타입이어야 한다(값 복사 위해).
-- 무중단 배포: 기존 사용자는 지금까지 보이던 게시판을 그대로 편집 가능(enabled_routes 복사).
-- Safe to re-run.

-- 이전 시도에서 jsonb 로 생성됐을 수 있으므로 제거 후 text[] 로 재생성(신규 컬럼이라 데이터 유실 없음).
ALTER TABLE public.feature_access DROP COLUMN IF EXISTS edit_routes;
ALTER TABLE public.feature_access ADD COLUMN edit_routes text[];

-- 기존 커스텀 접근 사용자: 현재 열람 가능한 게시판을 그대로 편집 허용으로 초기화(권한 축소 방지).
UPDATE public.feature_access
  SET edit_routes = enabled_routes
  WHERE edit_routes IS NULL;

NOTIFY pgrst, 'reload schema';
