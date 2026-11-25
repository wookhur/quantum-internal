-- 학부모 소통 제안('로드') 열람 권한
--
-- 이 화면은 컨설턴트가 올린 미팅 기록을 읽고 '담당자가 지금 무엇을 놓치고 있는지'를
-- 짚는 슈퍼바이징 도구다. 역할(admin·c_level·service_manager)로 묶지 않는다 —
-- 역할로 묶으면 그 역할을 받은 사람이 늘 때마다 화면이 조용히 따라 열린다.
-- 누가 보는지는 이 플래그로 사람이 직접 정한다.

alter table profiles
  add column if not exists is_service_supervisor boolean not null default false;

comment on column profiles.is_service_supervisor is
  '학부모 소통 제안(로드) 열람 권한 — 서비스팀 슈퍼바이저';

-- 서비스팀 총괄에게 부여
update profiles
set    is_service_supervisor = true,
       updated_at = now()
where  name = '김지현';

-- 확인
select name, email, role, position, is_service_supervisor
from   profiles
where  is_service_supervisor = true;
