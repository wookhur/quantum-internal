-- 프리랜서/파트너/인센티브 인보이스: 지급완료일
-- 승인(approved) 후 실제 지급이 나가면 이 날짜를 기록 → 지급완료로 표시.
-- 6·7월 등 이미 지급된 내역의 이력 추적, 중복/이월 판단에 사용.
alter table public.freelancer_invoices add column if not exists paid_date date;
notify pgrst, 'reload schema';
