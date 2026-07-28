-- 회사 안내: 인터널 관리앱 주소 + 카카오채널 주소 컬럼 추가
alter table public.company_info add column if not exists internal_app_url text;
alter table public.company_info add column if not exists kakao_channel text;
notify pgrst, 'reload schema';
