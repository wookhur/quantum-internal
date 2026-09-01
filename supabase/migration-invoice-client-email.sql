-- 인보이스 수령인 이메일 (견적서 엑셀 표기용). 대리발행 시 폼에서 입력.
-- 기존 freelancerEmail(프로필 이메일)과 별개 — 외부 파트너는 프로필이 없으므로 직접 입력한다.
-- (여러 번 실행해도 안전)
alter table public.freelancer_invoices
  add column if not exists client_email text;
