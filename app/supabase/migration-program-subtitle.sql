-- 프로그램/그룹에 작은 부제(담당자·기관) 추가 + 이름 변경 반영
alter table public.service_programs add column if not exists subtitle text;

-- 그룹/프로그램 이름 변경
update public.service_programs set group_name = '허브커넥서스' where group_name = '이광미원장님';
update public.service_programs set name = 'IRIS Edu', subtitle = '이우린 박사님' where key = 'lee_woorin';

-- 단독 프로그램 부제
update public.service_programs set subtitle = '남연서' where key = 'kyn';
update public.service_programs set subtitle = 'Ryan'   where key = 'next_bound';

-- 그룹 밴드 부제는 그룹의 첫 프로그램(sort 우선)에 저장 → 밴드 아래 작게 표시
update public.service_programs set subtitle = '퀀텀어드미션즈' where key = 'milkit';       -- 중동전쟁난민센터
update public.service_programs set subtitle = '이광미원장님'   where key = 'lgm_research';  -- 허브커넥서스

NOTIFY pgrst, 'reload schema';
