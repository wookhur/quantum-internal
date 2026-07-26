-- 계약 취소(중도해지) 시 환불 기록
alter table public.contracts add column if not exists refund_amount numeric;
alter table public.contracts add column if not exists refund_date date;
notify pgrst, 'reload schema';
