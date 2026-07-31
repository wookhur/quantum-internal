-- Student360 섹션 잠금: 지나가다 실수로 클릭·수정되는 것 방지.
-- 잠금 시 해당 섹션 편집 불가, 다시 잠금버튼 눌러 해제해야 수정 가능. (전 직원 공유 상태)
alter table public.service_students add column if not exists contract_locked boolean default false;
alter table public.service_students add column if not exists essay_locked boolean default false;
notify pgrst, 'reload schema';
