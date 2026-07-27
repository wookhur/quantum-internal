-- 환불 사유/상황 메모 (컨설턴트가 환불신청 시 기입 → 재무담당자 확인용)
alter table public.service_ec_activities add column if not exists refund_reason text;
alter table public.service_academic_support add column if not exists refund_reason text;
notify pgrst, 'reload schema';
