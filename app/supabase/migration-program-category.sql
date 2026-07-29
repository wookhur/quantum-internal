-- 파트너 프로그램을 카테고리로 분리(partner=프로그램관리, tutoring=과외강사관리).
-- 과외강사관리는 프로그램관리와 동일 구조(브로셔·AI·리드·통화기록·담당자연동)를 공유하고,
-- 엔트리가 '신청' 단계가 되면 학생 Student360 academic support에 연동한다.
alter table public.partner_programs add column if not exists category text default 'partner';
update public.partner_programs set category = 'partner' where category is null;

-- 과외 '신청' 시 생성된 academic support 연동(중복 방지)
alter table public.partner_program_entries add column if not exists academic_support_id uuid;

notify pgrst, 'reload schema';
