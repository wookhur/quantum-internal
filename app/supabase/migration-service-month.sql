-- 외부서비스(EC/학습지원): 교육 월(교육비 처리 월) 선택값
-- 값 예: '1월'..'12월', '여름특강', '겨울특강'
alter table public.service_ec_activities add column if not exists service_month text;
alter table public.service_academic_support add column if not exists service_month text;
notify pgrst, 'reload schema';
