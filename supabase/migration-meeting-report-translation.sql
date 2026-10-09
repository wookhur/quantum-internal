-- ============================================================
-- 미팅리포트 영어 번역 보관함
-- ------------------------------------------------------------
-- 올린 미팅리포트(구글 닥스·드라이브 PDF)를 통째로 영어로 옮겨 여기에 담는다.
-- 원문 링크(report_url)는 건드리지 않는다.
--
--   { "en": { "text": "...",                      -- 영어 전문
--             "sourceUrl": "https://docs...",     -- 번역할 때의 리포트 링크
--             "translatedAt": "2026-10-09T...",
--             "model": "claude-opus-5-5",
--             "truncated": false } }
--
-- sourceUrl 이 지금 report_url 과 다르면 앱이 '뒤처진 번역'으로 보고 다시 번역한다.
-- 리포트를 새 문서로 갈아 끼웠는데 옛 번역이 남아 있지 않게 하는 장치다.
--
-- 권한은 기존 service_meetings 정책을 그대로 따른다 (칸 하나가 늘어난 것뿐).
-- Safe to re-run.
-- ============================================================

alter table public.service_meetings add column if not exists report_translation jsonb;

comment on column public.service_meetings.report_translation is
  '올린 미팅리포트의 언어별 번역 전문. {"en":{text,sourceUrl,translatedAt,model,truncated}}. 원문은 report_url 그대로.';

notify pgrst, 'reload schema';
