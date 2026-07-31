-- 학생 휴면(Pause): 여행·휴가 등 일시 부재. 휴면 중에는 월 2회 미팅 요건·관리비 청구에서 제외.
alter table public.service_students add column if not exists paused boolean default false;
alter table public.service_students add column if not exists pause_reason text;
alter table public.service_students add column if not exists pause_return_date date;  -- 복귀예정일(안내용)
notify pgrst, 'reload schema';
