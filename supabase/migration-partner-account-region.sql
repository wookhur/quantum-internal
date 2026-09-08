-- 파트너 사람별 '계좌구분'(국내/해외). 발행유형(개인/사업자) 옆 토글로 지정.
-- 해외로 지정된 파트너는 자동청구 발행 시 해외 인보이스 양식이 기본으로 열린다.
-- (여러 번 실행해도 안전)
alter table public.partner_invoice_types
  add column if not exists account_region text;   -- 'domestic' | 'overseas'
