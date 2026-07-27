-- 계약 분납금(payment_installments) 건별 환불 처리
-- refund_status: NULL(환불 없음) | 'requested'(환불신청) | 'completed'(환불완료)
alter table public.payment_installments add column if not exists refund_status text;
alter table public.payment_installments add column if not exists refund_amount numeric;
alter table public.payment_installments add column if not exists refund_date date;
notify pgrst, 'reload schema';
