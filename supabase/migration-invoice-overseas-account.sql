-- 인보이스 계좌 구분(국내/해외) + 해외 송금 상세.
-- 개인/사업자 파트너 발행 시 '국내계좌/해외계좌'를 고르고, 해외면 SWIFT·IBAN 등 상세를 저장.
-- 해외계좌면 해외 인보이스 양식(overseas-invoice.xlsx)으로 발행된다.
-- (여러 번 실행해도 안전)
alter table public.freelancer_invoices
  add column if not exists account_region text,   -- 'domestic' | 'overseas'
  add column if not exists overseas_bank jsonb;    -- {country,bankName,bankAddress,swift,routing,iban,accountNumber,accountName,accountType,beneficiaryEmail}
