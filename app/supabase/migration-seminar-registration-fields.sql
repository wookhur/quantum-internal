-- 세미나 신청서 확장: 국내/해외 전화 분리 + 거주국가/지역 + 유입경로 + 신청인원
alter table public.seminar_registrations add column if not exists residence_type text;   -- 'domestic' | 'overseas'
alter table public.seminar_registrations add column if not exists country_code text;      -- 국가번호 (예: +82, +1)
alter table public.seminar_registrations add column if not exists area_code text;         -- 지역번호 (예: 010, 778)
alter table public.seminar_registrations add column if not exists phone_number text;       -- 전화번호 (하이픈/구분 없는 나머지)
alter table public.seminar_registrations add column if not exists country text;            -- 거주 국가
alter table public.seminar_registrations add column if not exists region_geo text;         -- 거주 지역 (Geographic Location)
alter table public.seminar_registrations add column if not exists source text;             -- 세미나를 알게되신 경로
alter table public.seminar_registrations add column if not exists applicant_count integer;  -- 신청 인원
notify pgrst, 'reload schema';
