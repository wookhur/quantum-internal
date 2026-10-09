-- ============================================================
-- 미팅일지 영어 번역 보관함
-- ------------------------------------------------------------
-- 한국어로 쓴 미팅일지를 해외 멘토·에디터가 읽을 수 있게 영어로 옮긴다.
-- 원문은 건드리지 않는다 — 번역은 이 칸에만 들어간다.
--
--   { "en": { "fields": { "meetingSummary": "...", ... },
--             "sourceHash": "1a2b3c4d",          -- 번역할 때의 원문 지문
--             "translatedAt": "2026-10-09T...",
--             "model": "claude-opus-5-5" } }
--
-- sourceHash 가 지금 원문과 다르면 앱이 '뒤처진 번역'으로 보고,
-- EN 을 다시 누를 때 새로 번역한다. 옛 영어본이 사실인 양 남지 않게 하는 장치다.
--
-- 권한은 기존 service_diary 정책을 그대로 따른다 (칸 하나가 늘어난 것뿐).
-- Safe to re-run.
-- ============================================================

alter table public.service_diary add column if not exists translations jsonb;

comment on column public.service_diary.translations is
  '언어별 번역본. {"en":{fields,sourceHash,translatedAt,model}}. 원문은 각 텍스트 칸에 그대로 있다.';

notify pgrst, 'reload schema';
