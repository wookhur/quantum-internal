-- 계약 분납금 환불: 환불 계좌 + 사유/메모 컬럼 추가
alter table public.payment_installments add column if not exists refund_account text;
alter table public.payment_installments add column if not exists refund_reason text;
notify pgrst, 'reload schema';
