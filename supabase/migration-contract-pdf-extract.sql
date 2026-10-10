-- ============================================================
-- 계약서 PDF 에서 읽은 값 보관함
-- ------------------------------------------------------------
-- 계약 입력은 사람이 한다 — 금액·날짜·이름을 AI 가 잘못 읽으면 안 되기 때문이다.
-- 다만 계약관리에 적는 항목은 360 이 필요로 하는 것보다 적어서(이메일, 학생·학부모
-- 연락처, 영문이름 …), 그 나머지는 매번 계약서를 보고 손으로 옮겨 적어야 했다.
--
-- 그 나머지만 계약서에서 읽어 여기에 담는다. 계약 레코드의 칸(contractor_name,
-- total_amount, contract_date …)은 건드리지 않는다 — 사람이 적은 값이 언제나 우선이다.
--
--   { "fields": { "studentEmail": "...", "parentPhone": "...", ... },
--     "sourceUrl": "https://…/contract.pdf",   -- 읽을 때의 계약서 링크
--     "extractedAt": "2026-10-10T...",
--     "model": "claude-sonnet-4-6" }
--
-- 한 번 읽어 두면 다음부터는 바로 쓴다(비용도 기다림도 없다). 계약서를 다른 파일로
-- 바꾸면 sourceUrl 이 달라지므로 앱이 '다시 읽어야 한다'고 본다.
-- Safe to re-run.
-- ============================================================

alter table public.contracts add column if not exists pdf_extract jsonb;

comment on column public.contracts.pdf_extract is
  '계약서 PDF 에서 읽은 보조 정보(이메일·연락처·영문이름 등). 사람이 적은 계약 칸과 섞지 않는다. {fields,sourceUrl,extractedAt,model}';

notify pgrst, 'reload schema';
