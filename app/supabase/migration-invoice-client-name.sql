-- 대리작성 인보이스의 수령인(신청인) 이름 저장용 컬럼
-- 파트너/프리랜서 인보이스를 재무담당이 대신 발행할 때, 로그인 계정이 아닌
-- 실제 수령인 이름이 목록·견적서에 뜨도록 함.
alter table public.freelancer_invoices add column if not exists client_name text;

notify pgrst, 'reload schema';
