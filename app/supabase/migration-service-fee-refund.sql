-- 외부서비스비(EC/학습지원) 건별 환불 처리
-- refund_status: NULL(환불 없음) | 'requested'(환불신청) | 'completed'(환불완료)
alter table public.service_ec_activities add column if not exists refund_status text;
alter table public.service_ec_activities add column if not exists refund_amount numeric;
alter table public.service_ec_activities add column if not exists refund_date date;

alter table public.service_academic_support add column if not exists refund_status text;
alter table public.service_academic_support add column if not exists refund_amount numeric;
alter table public.service_academic_support add column if not exists refund_date date;

notify pgrst, 'reload schema';
