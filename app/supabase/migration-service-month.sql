-- 외부서비스(EC/학습지원): 교육 월(교육비 처리 월) 선택값
-- 값 예: '1월'..'12월', '여름특강', '겨울특강'
alter table public.service_ec_activities add column if not exists service_month text;
alter table public.service_academic_support add column if not exists service_month text;

-- 실제 입금금액(페이백 구조 파트너사: 실입금 = 청구금액 − 페이백).
-- 인센티브는 청구금액(billed_amount) 기준으로 계산되며, 이 값은 참고/수금 기록용.
alter table public.service_ec_activities add column if not exists paid_amount numeric;
alter table public.service_academic_support add column if not exists paid_amount numeric;

notify pgrst, 'reload schema';
